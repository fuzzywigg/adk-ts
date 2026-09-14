import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("BuiltInPlanner leftover thinkingConfig matrices", () => {
	const configs = [
		{ includeThoughts: true },
		{ includeThoughts: false },
		{ includeThoughts: true, thinkingBudget: 0 },
		{ includeThoughts: true, thinkingBudget: 1 },
		{ includeThoughts: false, thinkingBudget: 128 },
		{ includeThinking: true, thinkingBudget: 64 },
		{ includeThoughts: true, thinkingBudget: 256, extra: "x" },
		{},
	];

	for (const [i, thinkingConfig] of configs.entries()) {
		it(`applies thinkingConfig combo #${i}`, () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: thinkingConfig as any,
			});
			const request = new LlmRequest();
			planner.applyThinkingConfig(request);
			expect((request.config as any).thinkingConfig).toEqual(thinkingConfig);
			expect(planner.thinkingConfig).toEqual(thinkingConfig);
		});
	}

	it("preserves unrelated config keys across apply", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 8 },
		});
		const request = new LlmRequest();
		request.config = {
			temperature: 0,
			topK: 1,
			stopSequences: ["END"],
		} as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toMatchObject({
			temperature: 0,
			topK: 1,
			stopSequences: ["END"],
			thinkingConfig: { includeThoughts: true, thinkingBudget: 8 },
		});
	});

	const falsyConfigs = [undefined, null, false, 0, ""];
	for (const [i, thinkingConfig] of falsyConfigs.entries()) {
		it(`skips apply when thinkingConfig falsy #${i}`, () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true },
			});
			planner.thinkingConfig = thinkingConfig as any;
			const request = new LlmRequest();
			request.config = { temperature: 0.3 } as any;
			planner.applyThinkingConfig(request);
			expect(request.config).toEqual({ temperature: 0.3 });
		});
	}

	it("buildPlanningInstruction always undefined across contexts", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		for (const ctx of [{}, { agentName: "a" }, null]) {
			expect(
				planner.buildPlanningInstruction(ctx as any, new LlmRequest()),
			).toBeUndefined();
		}
	});

	it("processPlanningResponse always undefined for varied parts", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false },
		});
		const partSets = [
			[],
			[{ text: "/*PLANNING*/ x" }],
			[{ functionCall: { name: "f", args: {} } }],
			[{ text: "" }, { text: "y" }],
		];
		for (const parts of partSets) {
			expect(
				planner.processPlanningResponse({} as any, parts as any),
			).toBeUndefined();
		}
	});
});

describe("PlanReActPlanner leftover empty / malformed step matrices", () => {
	const planner = new PlanReActPlanner();

	it("instruction always includes all planning tags", () => {
		const instruction = planner.buildPlanningInstruction(
			{} as any,
			new LlmRequest(),
		);
		for (const tag of [
			"/*PLANNING*/",
			"/*REPLANNING*/",
			"/*REASONING*/",
			"/*ACTION*/",
			"/*FINAL_ANSWER*/",
		]) {
			expect(instruction).toContain(tag);
		}
	});

	const emptyish = [null, undefined, []];
	for (const [i, parts] of emptyish.entries()) {
		it(`emptyish responseParts #${i} -> undefined`, () => {
			expect(
				planner.processPlanningResponse({} as any, parts as any),
			).toBeUndefined();
		});
	}

	const tagPrefixes = [
		"/*PLANNING*/",
		"/*REPLANNING*/",
		"/*REASONING*/",
		"/*ACTION*/",
	];
	for (const tag of tagPrefixes) {
		it(`marks ${tag} prefix as thought`, () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: `${tag} step body` },
			]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[0].text).toBe(`${tag} step body`);
		});
	}

	it("empty plan text then only empty-name function calls yields empty list", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "" },
			{ functionCall: { name: "", args: { a: 1 } } },
			{ functionCall: { name: undefined as any, args: {} } },
		]);
		expect(parts).toEqual([{ text: "" }]);
	});

	it("malformed FINAL_ANSWER with only whitespace answer", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ p /*FINAL_ANSWER*/   " },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe("   ");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("FINAL_ANSWER at start with no reasoning body", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/answer" },
		]);
		expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe("answer");
	});

	it("interleaved empty-name calls before first named call are skipped", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/" },
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: "", args: { x: 1 } } },
			{ functionCall: { name: "real", args: { q: "a" } } },
			{ functionCall: { name: "next", args: {} } },
			{ text: "stop group" },
			{ functionCall: { name: "late", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
			"/*ACTION*/",
			"real",
			"next",
		]);
	});

	it("non-text part before function call is preserved", () => {
		const blob = {
			inlineData: { mimeType: "image/png", data: "YQ==" },
		};
		const parts = planner.processPlanningResponse({} as any, [
			blob as any,
			{ functionCall: { name: "see", args: {} } },
		]);
		expect(parts?.[0]).toBe(blob);
		expect(parts?.[0].thought).toBeUndefined();
		expect(parts?.[1].functionCall?.name).toBe("see");
	});

	it("plain text without tags is not thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "no tags here" },
			{ text: "still plain" },
		]);
		expect(parts?.every((p) => p.thought === undefined)).toBe(true);
		expect(parts).toHaveLength(2);
	});

	it("tag not at start does not mark thought even with FINAL_ANSWER later", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "prefix /*PLANNING*/ mid /*FINAL_ANSWER*/ end" },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toContain("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" end");
	});

	it("multiple planning text parts before first function call", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ 1" },
			{ text: "/*REASONING*/ 2" },
			{ text: "/*ACTION*/ 3" },
			{ functionCall: { name: "tool", args: { n: 1 } } },
		]);
		expect(parts).toHaveLength(4);
		expect(parts?.slice(0, 3).every((p) => p.thought === true)).toBe(true);
		expect(parts?.[3].functionCall?.name).toBe("tool");
	});

	it("REPLANNING then FINAL_ANSWER split", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*REPLANNING*/ revise /*FINAL_ANSWER*/ final",
			},
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toContain("/*REPLANNING*/");
		expect(parts?.[1].text).toBe(" final");
	});

	it("when first part is a named function call, consecutive siblings are not collected (index>0 gate)", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "a", args: {} } },
			{ functionCall: { name: "b", args: {} } },
			{ text: "break" },
			{ functionCall: { name: "c", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual(["a"]);
	});

	it("collects consecutive function calls when firstFcPartIndex is greater than 0", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/" },
			{ functionCall: { name: "a", args: {} } },
			{ functionCall: { name: "b", args: {} } },
			{ text: "break" },
			{ functionCall: { name: "c", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
			"/*ACTION*/",
			"a",
			"b",
		]);
	});

	it("buildPlanningInstruction ignores request contents", () => {
		const a = planner.buildPlanningInstruction({} as any, new LlmRequest());
		const b = planner.buildPlanningInstruction(
			{} as any,
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "x" }] }],
			} as any),
		);
		expect(a).toBe(b);
		expect(a.length).toBeGreaterThan(100);
	});

	const whitespacePlans = [" ", "\n", "\t", "   \n  "];
	for (const [i, text] of whitespacePlans.entries()) {
		it(`whitespace-only plan part #${i} not thought`, () => {
			const parts = planner.processPlanningResponse({} as any, [{ text }]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0].thought).toBeUndefined();
			expect(parts?.[0].text).toBe(text);
		});
	}
});
