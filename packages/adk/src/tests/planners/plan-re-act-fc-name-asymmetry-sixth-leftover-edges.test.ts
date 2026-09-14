import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner FC-name asymmetry sixth leftover (post #151)", () => {
	const planner = new PlanReActPlanner();

	it.each([
		{ label: "space", name: " " },
		{ label: "tab", name: "\t" },
		{ label: "newline", name: "\n" },
		{ label: "spaces", name: "   " },
	] as const)("keeps whitespace-only functionCall.name ($label) because !name is false for non-empty strings", ({
		name,
	}) => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ prep" },
			{ functionCall: { name, args: { q: 1 } } },
			{ functionCall: { name: "fetch", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
			"/*REASONING*/ prep",
			name,
			"fetch",
		]);
		expect(parts?.[0].thought).toBe(true);
	});

	it("consecutive-group loop keeps empty-name FC after a named FC (no empty-name filter)", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/ go" },
			{ functionCall: { name: "search", args: { q: "a" } } },
			{ functionCall: { name: "", args: { skipped: false } } },
			{ functionCall: { name: undefined as any, args: {} } },
			{ functionCall: { name: "fetch", args: {} } },
			{ text: "stop" },
		]);
		expect(parts?.map((p) => p.functionCall?.name ?? p.text)).toEqual([
			"/*ACTION*/ go",
			"search",
			"",
			undefined,
			"fetch",
		]);
	});

	it("still skips empty-name FCs before the first named FC in the scan loop", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ before" },
			{ functionCall: { name: "", args: { a: 1 } } },
			{ functionCall: { name: null as any, args: {} } },
			{ functionCall: { name: "real", args: { ok: true } } },
			{ functionCall: { name: "", args: { after: true } } },
		]);
		expect(parts).toHaveLength(3);
		expect(parts?.[0].text).toBe("/*REASONING*/ before");
		expect(parts?.[1].functionCall?.name).toBe("real");
		expect(parts?.[2].functionCall?.name).toBe("");
	});

	it("whitespace-only name as first FC (index 0) does not collect trailing consecutive FCs", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: " ", args: {} } },
			{ functionCall: { name: "fetch", args: {} } },
			{ text: "ignored" },
		]);
		expect(parts?.map((p) => p.functionCall?.name)).toEqual([" "]);
	});
});
