import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Thirteenth leftover: processPlanningResponse only sees camel functionCall.
 * Twelfth leftover pinned empty-name on camel objects, not snake keys.
 */
describe("plan-react function_call snake vs camel thirteenth leftover edges", () => {
	const planner = new PlanReActPlanner();

	it("snake function_call is not treated as an FC (later camel still first)", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ function_call: { name: "search" } } as any,
			{ functionCall: { name: "ok" } },
		]);
		expect(parts).toHaveLength(2);
		expect((parts?.[0] as any).function_call?.name).toBe("search");
		expect(parts?.[1].functionCall?.name).toBe("ok");
	});

	it("camel functionCall is collected (control)", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "only" } },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("only");
	});

	it("snake-then-camel: snake preserved as non-FC then camel starts the group", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ function_call: { name: "snake" } } as any,
			{ text: "note" },
			{ functionCall: { name: "camel" } },
			{ functionCall: { name: "camel2" } },
		]);
		expect(
			parts?.map(
				(p) => p.functionCall?.name || (p as any).function_call?.name || p.text,
			),
		).toEqual(["snake", "note", "camel", "camel2"]);
	});

	it("consecutive window only groups camel functionCall after first camel", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "first" } },
			{ function_call: { name: "snake-after" } } as any,
			{ functionCall: { name: "unreachable" } },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("first");
	});
});
