import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner deepen edges (TOKENMAXX after #153)", () => {
	const planner = new PlanReActPlanner();

	it("keeps empty-name FC siblings after a named FC when firstFc index > 0", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ before" },
			{ functionCall: { name: "search", args: { q: 1 } } },
			{ functionCall: { name: "", args: { bad: true } } },
			{ functionCall: { name: undefined as any, args: {} } },
			{ text: "after group" },
		]);
		expect(parts?.map((p) => p.functionCall?.name ?? p.text)).toEqual([
			"/*REASONING*/ before",
			"search",
			"",
			undefined,
		]);
		expect(parts?.[0].thought).toBe(true);
	});

	it("prefers functionCall when a part has both text and functionCall", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*PLANNING*/ ignored when FC present",
				functionCall: { name: "dual", args: { x: 1 } },
			},
			{ text: "trailing" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("dual");
		expect(parts?.[0].thought).toBeUndefined();
	});

	it("when first named FC is at index 0, does not collect trailing FC siblings", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "lead", args: {} } },
			{ functionCall: { name: "sibling", args: { a: 1 } } },
			{ functionCall: { name: "", args: {} } },
			{ text: "narration" },
		]);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual(["lead"]);
	});

	it.each([
		{
			label: "empty-name skip leaves firstFc index > 0 so siblings collect",
			input: [
				{ functionCall: { name: "", args: {} } },
				{ functionCall: { name: "kept", args: { k: 1 } } },
				{ functionCall: { name: "also", args: {} } },
			],
			expectedNames: ["kept", "also"],
		},
		{
			label: "named mid-stream then empty-name sibling window",
			input: [
				{ text: "/*ACTION*/ act" },
				{ functionCall: { name: "tool_a", args: {} } },
				{ functionCall: { name: "", args: { ghost: true } } },
				{ functionCall: { name: "tool_b", args: { n: 2 } } },
				{ text: "stop" },
			],
			expectedNames: [undefined, "tool_a", "", "tool_b"],
		},
	])("matrix: $label", ({ input, expectedNames }) => {
		const parts = planner.processPlanningResponse({} as any, input as any);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual(expectedNames);
	});

	it("FINAL_ANSWER tag-only leaves reasoning thought and empty trailer skipped", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
	});

	it("FINAL_ANSWER with whitespace-only trailer still emits trailer text", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "think /*FINAL_ANSWER*/   " },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[0].text).toBe("think /*FINAL_ANSWER*/");
		expect(parts?.[1].text).toBe("   ");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("whitespace functionCall name is truthy and preserved in discovery", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: " ", args: {} } },
			{ functionCall: { name: "next", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual([" "]);
	});

	it("tag-path mutates the input part in place when marking thought", () => {
		const input = { text: "/*PLANNING*/ mutate-me" };
		const parts = planner.processPlanningResponse({} as any, [input]);
		expect(parts?.[0]).toBe(input);
		expect(input.thought).toBe(true);
	});

	it("name '0' and 'false' are treated as valid functionCall names", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "pre" },
			{ functionCall: { name: "0", args: {} } },
			{ functionCall: { name: "false", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name ?? p.text)).toEqual([
			"pre",
			"0",
			"false",
		]);
	});
});
