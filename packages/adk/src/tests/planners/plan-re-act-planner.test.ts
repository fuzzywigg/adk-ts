import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner", () => {
	const planner = new PlanReActPlanner();

	it("includes planning tags in the instruction", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction).toContain("/*PLANNING*/");
		expect(instruction).toContain("/*ACTION*/");
		expect(instruction).toContain("/*REASONING*/");
		expect(instruction).toContain("/*FINAL_ANSWER*/");
		expect(instruction).toContain("/*REPLANNING*/");
	});

	it("returns undefined for empty responses", () => {
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
	});

	it("splits final answer text and marks reasoning as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ step one /*FINAL_ANSWER*/ the answer",
			},
		]);

		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toContain("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" the answer");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("filters empty function call names and keeps named calls", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ thinking" },
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: "search", args: { q: "x" } } },
			{ functionCall: { name: "lookup", args: {} } },
			{ text: "after tools" },
		]);

		expect(parts?.[0].thought).toBe(true);
		expect(parts?.slice(1).map((p) => p.functionCall?.name)).toEqual([
			"search",
			"lookup",
		]);
		expect(parts?.some((p) => p.text === "after tools")).toBe(false);
	});

	it("marks /*REPLANNING*/ content as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REPLANNING*/ revise the plan with new tools" },
		]);

		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toContain("/*REPLANNING*/");
		expect(parts?.[0].thought).toBe(true);
	});

	it("handles a response with only /*ACTION*/ text then function calls", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/" },
			{ functionCall: { name: "search", args: { q: "adk" } } },
			{ functionCall: { name: "summarize", args: {} } },
		]);

		expect(parts?.[0].text).toBe("/*ACTION*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.slice(1).map((p) => p.functionCall?.name)).toEqual([
			"search",
			"summarize",
		]);
	});

	it("keeps planning text without FINAL_ANSWER as thought-only", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ outline the steps /*REASONING*/ check assumptions",
			},
		]);

		expect(parts).toHaveLength(1);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toContain("/*PLANNING*/");
		expect(parts?.[0].text).toContain("/*REASONING*/");
	});

	it("returns empty preserved list when only empty-name function calls exist", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "", args: {} } },
			{ functionCall: { name: undefined as any, args: {} } },
		]);

		expect(parts ?? []).toEqual([]);
	});
});
