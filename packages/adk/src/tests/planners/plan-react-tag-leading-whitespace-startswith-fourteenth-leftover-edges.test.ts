import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Fourteenth leftover: tag startsWith requires tag at index 0. Leading
 * whitespace before a PLANNING/REASONING/ACTION tag fails; exact prefix
 * marks thought.
 */
describe("plan-react tag leading-whitespace startsWith fourteenth leftover edges", () => {
	const planner = new PlanReActPlanner();

	it.each([
		" /*PLANNING*/ x",
		"\t/*REASONING*/ y",
		"\n/*ACTION*/ go",
		"  /*REPLANNING*/ z",
	])("leading whitespace before tag %j is not marked thought", (text) => {
		const parts = planner.processPlanningResponse({} as any, [{ text }]);
		expect(parts?.[0].thought).toBeUndefined();
		expect(parts?.[0].text).toBe(text);
	});

	it.each([
		"/*PLANNING*/ x",
		"/*REASONING*/ y",
		"/*ACTION*/ go",
		"/*REPLANNING*/ z",
	])("exact tag prefix %j marks thought (control)", (text) => {
		const parts = planner.processPlanningResponse({} as any, [{ text }]);
		expect(parts?.[0].thought).toBe(true);
	});

	it("trailing whitespace after exact tag still marks thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/   " },
		]);
		expect(parts?.[0].thought).toBe(true);
	});
});
