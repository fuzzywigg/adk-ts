import { describe, expect, it } from "vitest";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner heavy matrix leftover edges", () => {
	const planner = new PlanReActPlanner();

	it("buildPlanningInstruction includes all planning tags", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		for (const tag of [
			"/*PLANNING*/",
			"/*ACTION*/",
			"/*REASONING*/",
			"/*FINAL_ANSWER*/",
			"/*REPLANNING*/",
		]) {
			expect(instruction).toContain(tag);
		}
	});

	it("returns undefined for empty or missing parts", () => {
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
		expect(
			planner.processPlanningResponse({} as any, undefined as any),
		).toBeUndefined();
	});

	it("splits FINAL_ANSWER into thought prefix and answer text", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ plan /*FINAL_ANSWER*/ answer text" },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toContain("/*FINAL_ANSWER*/");
		expect(parts?.[1].text).toBe(" answer text");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("marks REASONING-only content as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ thinking hard" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].thought).toBe(true);
	});

	it("marks REPLANNING content as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REPLANNING*/ revise" },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toContain("/*REPLANNING*/");
	});

	it("filters empty function call names but keeps named calls", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/" },
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: "search", args: { q: "x" } } },
			{ functionCall: { name: "lookup", args: {} } },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.slice(1).map((p) => p.functionCall?.name)).toEqual([
			"search",
			"lookup",
		]);
	});

	it("stops collecting text after encountering function calls", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ think" },
			{ functionCall: { name: "tool", args: {} } },
			{ text: "after tools should be dropped" },
		]);
		expect(parts?.some((p) => p.text === "after tools should be dropped")).toBe(
			false,
		);
		expect(parts?.map((p) => p.functionCall?.name).filter(Boolean)).toEqual([
			"tool",
		]);
	});

	it("keeps planning without FINAL_ANSWER as thought-only", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ outline /*REASONING*/ check",
			},
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].thought).toBe(true);
	});

	it("handles FINAL_ANSWER at the start of the text", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/ only answer" },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" only answer");
	});

	it("handles multiple text parts before tools", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ step" },
			{ text: "/*REASONING*/ more" },
			{ functionCall: { name: "go", args: { x: 1 } } },
		]);
		expect(parts?.filter((p) => p.thought).length).toBeGreaterThanOrEqual(1);
		expect(parts?.at(-1)?.functionCall?.name).toBe("go");
	});

	it("preserves function call args objects", () => {
		const args = { nested: { a: 1 }, list: [1, 2] };
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/" },
			{ functionCall: { name: "rich", args } },
		]);
		expect(parts?.at(-1)?.functionCall?.args).toEqual(args);
	});

	it("ignores non-text non-function parts while scanning", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ p" },
			{ inlineData: { data: "x", mimeType: "text/plain" } } as any,
			{ functionCall: { name: "after", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name).filter(Boolean)).toEqual([
			"after",
		]);
	});
});

describe("BuiltInPlanner heavy matrix leftover edges", () => {
	it("stores thinkingConfig from constructor", () => {
		const thinkingConfig = {
			includeThoughts: true,
			thinkingBudget: 128,
		} as any;
		const planner = new BuiltInPlanner({ thinkingConfig });
		expect(planner.thinkingConfig).toBe(thinkingConfig);
	});

	it("applyThinkingConfig initializes llmRequest.config when missing", () => {
		const thinkingConfig = { includeThoughts: true } as any;
		const planner = new BuiltInPlanner({ thinkingConfig });
		const llmRequest: any = {};
		planner.applyThinkingConfig(llmRequest);
		expect(llmRequest.config.thinkingConfig).toBe(thinkingConfig);
	});

	it("applyThinkingConfig merges into existing config object", () => {
		const thinkingConfig = { thinkingBudget: 64 } as any;
		const planner = new BuiltInPlanner({ thinkingConfig });
		const llmRequest: any = { config: { temperature: 0.2 } };
		planner.applyThinkingConfig(llmRequest);
		expect(llmRequest.config.temperature).toBe(0.2);
		expect(llmRequest.config.thinkingConfig).toBe(thinkingConfig);
	});

	it("buildPlanningInstruction always returns undefined", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false } as any,
		});
		expect(
			planner.buildPlanningInstruction({} as any, {} as any),
		).toBeUndefined();
	});

	it("processPlanningResponse always returns undefined", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true } as any,
		});
		expect(
			planner.processPlanningResponse({} as any, [{ text: "x" }]),
		).toBeUndefined();
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
	});

	it("overwrites a prior thinkingConfig on the request", () => {
		const first = { thinkingBudget: 1 } as any;
		const second = { thinkingBudget: 2 } as any;
		const planner = new BuiltInPlanner({ thinkingConfig: second });
		const llmRequest: any = { config: { thinkingConfig: first } };
		planner.applyThinkingConfig(llmRequest);
		expect(llmRequest.config.thinkingConfig).toBe(second);
	});
});
