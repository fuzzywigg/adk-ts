import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Twelfth leftover: startsWith/includes use the raw tag constants, not a
 * tokenized delimiter. Eleventh leftover covered letter case only.
 */
describe("plan-react tag startsWith delimiter exactness twelfth leftover edges", () => {
	const planner = new PlanReActPlanner();

	it.each([
		"/*PLANNING */ x",
		"/*PLAN*/",
		"/*PLANNING*",
		"/*ACTION",
		"/*REASONING / y",
		"/*REPLANNING */ z",
	])("near-miss delimiter %j is not marked thought", (text) => {
		const parts = planner.processPlanningResponse({} as any, [{ text }]);
		expect(parts?.[0].thought).toBeUndefined();
		expect(parts?.[0].text).toBe(text);
	});

	it("superstring after the full PLANNING tag still marks thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/EXTRA" },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toBe("/*PLANNING*/EXTRA");
	});

	it("FINAL_ANSWER with space before close does not split", () => {
		const text = "/*FINAL_ANSWER */ ans";
		const parts = planner.processPlanningResponse({} as any, [{ text }]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe(text);
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("exact PLANNING tag with body still marks thought (control)", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ x" },
		]);
		expect(parts?.[0].thought).toBe(true);
	});
});
