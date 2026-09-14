import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Twelfth leftover: discovery `if (!functionCall?.name) continue` treats
 * numeric 0 / false / NaN as empty (skip). String "0" / "false" stay.
 * Consecutive window after a named FC still has no name filter.
 */
describe("plan-react fc-name numeric 0/false filter twelfth leftover edges", () => {
	const planner = new PlanReActPlanner();

	it.each([
		{ label: "0", name: 0 },
		{ label: "false", name: false },
		{ label: "NaN", name: Number.NaN },
	])("discovery skips $label name then keeps the first named FC", ({
		name,
	}) => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ before" },
			{ functionCall: { name: name as any, args: { skipped: true } } },
			{ functionCall: { name: "real", args: { ok: true } } },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toBe("/*REASONING*/ before");
		expect(parts?.[1].functionCall?.name).toBe("real");
	});

	it.each([
		{ label: "string 0", name: "0" },
		{ label: "string false", name: "false" },
	])("discovery keeps $label name (truthy string)", ({ name }) => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/ go" },
			{ functionCall: { name, args: {} } },
			{ functionCall: { name: "fetch", args: {} } },
		]);
		expect(parts?.map((p) => p.functionCall?.name || p.text)).toEqual([
			"/*ACTION*/ go",
			name,
			"fetch",
		]);
	});

	it("consecutive window after named FC keeps numeric 0 and false names", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/ go" },
			{ functionCall: { name: "search", args: {} } },
			{ functionCall: { name: 0 as any, args: {} } },
			{ functionCall: { name: false as any, args: {} } },
			{ functionCall: { name: "fetch", args: {} } },
			{ text: "stop" },
		]);
		expect(parts?.map((p) => p.functionCall?.name ?? p.text)).toEqual([
			"/*ACTION*/ go",
			"search",
			0,
			false,
			"fetch",
		]);
	});
});
