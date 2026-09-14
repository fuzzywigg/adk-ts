import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Eleventh leftover: _markAsThought uses if (responsePart.text) — empty
 * string is falsy so thought is never set; whitespace is truthy.
 * Missing-text no-op already covered.
 */
describe("plan-react mark-thought empty-string eleventh leftover edges", () => {
	const planner = new PlanReActPlanner();

	it("empty-string text does not set thought", () => {
		const part: { text: string; thought?: boolean } = { text: "" };
		(planner as any)._markAsThought(part);
		expect(part.thought).toBeUndefined();
	});

	it.each([
		{ label: "space", text: " " },
		{ label: "tab", text: "\t" },
		{ label: "newline", text: "\n" },
		{ label: "zero digit", text: "0" },
	])("truthy text ($label) sets thought=true", ({ text }) => {
		const part: { text: string; thought?: boolean } = { text };
		(planner as any)._markAsThought(part);
		expect(part.thought).toBe(true);
	});

	it("tag-prefixed empty trailer after FINAL_ANSWER still marks reasoning when non-empty", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/" },
		]);
		expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
	});

	it("planning tag with empty-string body still marks thought via startsWith", () => {
		const input = { text: "/*PLANNING*/" };
		const parts = planner.processPlanningResponse({} as any, [input]);
		expect(parts?.[0]).toBe(input);
		expect(parts?.[0].thought).toBe(true);
	});
});
