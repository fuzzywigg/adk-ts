import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Eleventh leftover: tag startsWith is case-sensitive — mixed-case /
 * near-miss tags are not marked thought. Sixth covers full lowercase only.
 */
describe("plan-react tag-startsWith case-sensitivity eleventh leftover edges", () => {
	const planner = new PlanReActPlanner();

	it.each([
		"/*Planning*/ x",
		"/*PlAnNiNg*/X",
		"/*Reasoning*/ y",
		"/*Action*/ go",
		"/*Replanning*/ z",
		"/*final_answer*/ ans",
		"/*Final_Answer*/ ans",
		"/*Final_answer*/ ans",
	])("mixed/near-miss tag %j is not marked thought", (text) => {
		const parts = planner.processPlanningResponse({} as any, [{ text }]);
		expect(parts?.[0].thought).toBeUndefined();
		expect(parts?.[0].text).toBe(text);
	});

	it.each([
		"/*PLANNING*/ x",
		"/*REASONING*/ y",
		"/*ACTION*/ go",
		"/*REPLANNING*/ z",
	])("exact uppercase tag %j marks thought (control)", (text) => {
		const parts = planner.processPlanningResponse({} as any, [{ text }]);
		expect(parts?.[0].thought).toBe(true);
	});

	it("includes(FINAL_ANSWER) is also case-sensitive for split path", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*final_answer*/ hidden" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe("/*final_answer*/ hidden");
		expect(parts?.[0].thought).toBeUndefined();
	});
});
