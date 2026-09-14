import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner + BuiltInPlanner heavy matrix edges", () => {
	const planner = new PlanReActPlanner();

	describe("PlanReActPlanner tag matrices", () => {
		it.each([
			"/*PLANNING*/",
			"/*REASONING*/",
			"/*ACTION*/",
			"/*REPLANNING*/",
		])("marks leading %s text as thought", (tag) => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: `${tag} body` },
			]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[0].text).toBe(`${tag} body`);
		});

		it.each([
			"lead /*PLANNING*/ x",
			"lead /*REASONING*/ x",
			"lead /*ACTION*/ x",
			"lead /*REPLANNING*/ x",
		])("does not mark mid-text tag in %s", (text) => {
			const parts = planner.processPlanningResponse({} as any, [{ text }]);
			expect(parts?.[0].thought).toBeUndefined();
			expect(parts?.[0].text).toBe(text);
		});

		it.each([
			"   /*PLANNING*/ plan",
			"\t/*ACTION*/ go",
			"\n/*REASONING*/ r",
		])("treats leading whitespace before tag as non-thought: %j", (text) => {
			const parts = planner.processPlanningResponse({} as any, [{ text }]);
			expect(parts?.[0].thought).toBeUndefined();
		});

		it("splits on the last FINAL_ANSWER when multiple appear", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{
					text: "/*PLANNING*/ a /*FINAL_ANSWER*/ mid /*FINAL_ANSWER*/ real",
				},
			]);
			expect(parts).toHaveLength(2);
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[0].text).toContain("mid");
			expect(parts?.[1].text).toBe(" real");
			expect(parts?.[1].thought).toBeUndefined();
		});

		it("FINAL_ANSWER-only yields thought tag part plus answer", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*FINAL_ANSWER*/ only" },
			]);
			expect(parts).toHaveLength(2);
			expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
			expect(parts?.[0].thought).toBe(true);
			expect(parts?.[1].text).toBe(" only");
		});

		it("omits empty answer trailer after FINAL_ANSWER", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*REASONING*/ almost /*FINAL_ANSWER*/" },
			]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0].text).toBe("/*REASONING*/ almost /*FINAL_ANSWER*/");
			expect(parts?.[0].thought).toBe(true);
		});

		it("buildPlanningInstruction includes all required tags", () => {
			const instruction = planner.buildPlanningInstruction(
				{} as any,
				{} as any,
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
			expect(instruction).toContain("Available Tools");
			expect(instruction).toContain("VERY IMPORTANT instruction");
		});
	});

	describe("PlanReActPlanner function-call matrices", () => {
		it("filters empty and nullish function call names", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name: "", args: {} } },
				{ functionCall: { name: undefined as any, args: {} } },
				{ functionCall: { name: null as any, args: {} } },
				{ functionCall: { name: "valid", args: { q: 1 } } },
			]);
			expect(parts?.map((p) => p.functionCall?.name)).toEqual(["valid"]);
		});

		it("stops FC group at first non-call part", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*ACTION*/ go" },
				{ functionCall: { name: "first", args: {} } },
				{ text: "interrupt" },
				{ functionCall: { name: "second", args: {} } },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*ACTION*/ go",
				"first",
			]);
		});

		it("keeps leading FC group only when no text precedes", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name: "search", args: { q: "x" } } },
				{ functionCall: { name: "fetch", args: {} } },
				{ text: "ignored" },
			]);
			expect(parts?.map((p) => p.functionCall?.name)).toEqual(["search"]);
		});

		it("collects consecutive FCs after FINAL_ANSWER split", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*REASONING*/ prep /*FINAL_ANSWER*/ done" },
				{ functionCall: { name: "a", args: {} } },
				{ functionCall: { name: "b", args: {} } },
				{ text: "after" },
				{ functionCall: { name: "late", args: {} } },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*REASONING*/ prep /*FINAL_ANSWER*/",
				" done",
				"a",
				"b",
			]);
		});

		it("returns empty preserved list when only empty-name FCs exist", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ functionCall: { name: "", args: {} } },
				{ functionCall: { name: undefined as any, args: {} } },
			]);
			expect(parts ?? []).toEqual([]);
		});

		it("preserves non-text parts without thought", () => {
			const inline = {
				inlineData: { mimeType: "text/plain", data: "abc" },
			};
			const parts = planner.processPlanningResponse({} as any, [inline as any]);
			expect(parts).toHaveLength(1);
			expect(parts?.[0]).toBe(inline);
			expect(parts?.[0].thought).toBeUndefined();
		});

		it("preserves empty text parts without thought", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "" },
				{ text: "/*REASONING*/ later" },
			]);
			expect(parts?.[0].text).toBe("");
			expect(parts?.[0].thought).toBeUndefined();
			expect(parts?.[1].thought).toBe(true);
		});

		it("returns undefined for empty/nullish responseParts", () => {
			expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
			expect(
				planner.processPlanningResponse({} as any, null as any),
			).toBeUndefined();
			expect(
				planner.processPlanningResponse({} as any, undefined as any),
			).toBeUndefined();
		});

		it("mixed planning tags then FC group matrix", () => {
			const parts = planner.processPlanningResponse({} as any, [
				{ text: "/*PLANNING*/ step" },
				{ text: "/*REASONING*/ observe" },
				{ text: "/*ACTION*/ prepare" },
				{ text: "/*REPLANNING*/ revise" },
				{ text: "/*REASONING*/ almost /*FINAL_ANSWER*/ answer" },
				{ functionCall: { name: "", args: {} } },
				{ functionCall: { name: "tool_a", args: { n: 1 } } },
				{ functionCall: { name: "tool_b", args: { n: 2 } } },
				{ text: "trailing" },
			]);
			expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
				"/*PLANNING*/ step",
				"/*REASONING*/ observe",
				"/*ACTION*/ prepare",
				"/*REPLANNING*/ revise",
				"/*REASONING*/ almost /*FINAL_ANSWER*/",
				" answer",
				"tool_a",
				"tool_b",
			]);
			expect(parts?.slice(0, 5).every((p) => p.thought === true)).toBe(true);
			expect(parts?.[5].thought).toBeUndefined();
		});
	});

	describe("PlanReActPlanner private helper matrices", () => {
		it("_splitByLastPattern returns [text, ''] when separator missing", () => {
			expect(
				(planner as any)._splitByLastPattern("no marker", "/*FINAL_ANSWER*/"),
			).toEqual(["no marker", ""]);
			expect(
				(planner as any)._splitByLastPattern("", "/*FINAL_ANSWER*/"),
			).toEqual(["", ""]);
		});

		it("_splitByLastPattern splits on last occurrence", () => {
			expect(
				(planner as any)._splitByLastPattern(
					"a /*FINAL_ANSWER*/ b /*FINAL_ANSWER*/ c",
					"/*FINAL_ANSWER*/",
				),
			).toEqual(["a /*FINAL_ANSWER*/ b /*FINAL_ANSWER*/", " c"]);
		});

		it("_markAsThought is a no-op without text", () => {
			const part: any = { functionCall: { name: "x", args: {} } };
			(planner as any)._markAsThought(part);
			expect(part.thought).toBeUndefined();
		});

		it("_handleNonFunctionCallParts preserves inline data", () => {
			const preserved: any[] = [];
			(planner as any)._handleNonFunctionCallParts(
				{ inlineData: { data: "x", mimeType: "text/plain" } },
				preserved,
			);
			expect(preserved).toHaveLength(1);
			expect(preserved[0].thought).toBeUndefined();
		});
	});

	describe("BuiltInPlanner thinking matrices", () => {
		it.each([
			{ includeThoughts: true, thinkingBudget: 8 },
			{ includeThoughts: true, thinkingBudget: 64 },
			{ includeThoughts: false, thinkingBudget: 128 },
			{ includeThoughts: true, thinkingBudget: 256 },
			{ includeThoughts: false },
		])("applies thinkingConfig %j onto request", (thinkingConfig) => {
			const builtIn = new BuiltInPlanner({ thinkingConfig });
			const request = new LlmRequest();
			builtIn.applyThinkingConfig(request);
			expect((request.config as any).thinkingConfig).toEqual(thinkingConfig);
		});

		it("preserves existing config keys when applying thinking", () => {
			const thinkingConfig = { includeThoughts: false, thinkingBudget: 32 };
			const builtIn = new BuiltInPlanner({ thinkingConfig });
			const request = new LlmRequest();
			request.config = { temperature: 0.2, topP: 0.9 } as any;
			builtIn.applyThinkingConfig(request);
			expect(request.config).toMatchObject({
				temperature: 0.2,
				topP: 0.9,
				thinkingConfig,
			});
		});

		it("overwrites an existing thinkingConfig", () => {
			const builtIn = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true, thinkingBudget: 256 },
			});
			const request = new LlmRequest();
			request.config = {
				thinkingConfig: { includeThoughts: false, thinkingBudget: 8 },
			} as any;
			builtIn.applyThinkingConfig(request);
			expect((request.config as any).thinkingConfig).toEqual({
				includeThoughts: true,
				thinkingBudget: 256,
			});
		});

		it("no-ops when thinkingConfig is falsy", () => {
			const builtIn = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true },
			});
			builtIn.thinkingConfig = undefined as any;
			const request = new LlmRequest();
			request.config = { temperature: 0.5 } as any;
			builtIn.applyThinkingConfig(request);
			expect(request.config).toEqual({ temperature: 0.5 });
			expect((request.config as any).thinkingConfig).toBeUndefined();
		});

		it("no-ops for null thinkingConfig and leaves bare config undefined", () => {
			const builtIn = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true },
			});
			builtIn.thinkingConfig = null as any;
			const bare = new LlmRequest();
			builtIn.applyThinkingConfig(bare);
			expect(bare.config).toBeUndefined();
		});

		it("applies empty-object thinkingConfig because it is truthy", () => {
			const builtIn = new BuiltInPlanner({ thinkingConfig: {} as any });
			const request = new LlmRequest();
			builtIn.applyThinkingConfig(request);
			expect(request.config).toEqual({ thinkingConfig: {} });
		});

		it("applyThinkingConfig is idempotent", () => {
			const thinkingConfig = { includeThoughts: true, thinkingBudget: 16 };
			const builtIn = new BuiltInPlanner({ thinkingConfig });
			const request = new LlmRequest();
			builtIn.applyThinkingConfig(request);
			builtIn.applyThinkingConfig(request);
			expect(request.config).toEqual({ thinkingConfig });
		});

		it("buildPlanningInstruction and processPlanningResponse always undefined", () => {
			const builtIn = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: false },
			});
			expect(
				builtIn.buildPlanningInstruction({} as any, new LlmRequest()),
			).toBeUndefined();
			expect(
				builtIn.processPlanningResponse({} as any, [{ text: "plan" }]),
			).toBeUndefined();
			expect(builtIn.processPlanningResponse({} as any, [])).toBeUndefined();
		});

		it("exposes thinkingConfig from constructor", () => {
			const thinkingConfig = { includeThoughts: true, thinkingBudget: 64 };
			const builtIn = new BuiltInPlanner({ thinkingConfig });
			expect(builtIn.thinkingConfig).toEqual(thinkingConfig);
		});
	});
});
