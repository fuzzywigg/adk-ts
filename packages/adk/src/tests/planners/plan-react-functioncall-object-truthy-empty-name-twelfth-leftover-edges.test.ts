import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Twelfth leftover: `if (responseParts[i].functionCall)` is object-truthy,
 * then `!name` filters. Empty `{}` / `[]` are skipped in discovery.
 * Falsy functionCall (0 / false / "") is treated as a non-FC part.
 */
describe("plan-react functionCall object-truthy empty-name twelfth leftover edges", () => {
	const planner = new PlanReActPlanner();

	it("empty-object functionCall is skipped in discovery", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: {} as any },
			{ functionCall: { name: "ok" } },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("ok");
	});

	it("empty-array functionCall is skipped in discovery", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: [] as any },
			{ functionCall: { name: "ok" } },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("ok");
	});

	it("falsy numeric 0 functionCall is treated as non-FC and preserved", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: 0 as any },
			{ functionCall: { name: "ok" } },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].functionCall).toBe(0);
		expect(parts?.[1].functionCall?.name).toBe("ok");
	});

	it("falsy false functionCall is preserved as a non-FC part", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: false as any },
			{ functionCall: { name: "ok" } },
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].functionCall).toBe(false);
		expect(parts?.[1].functionCall?.name).toBe("ok");
	});

	it("empty-string name is still filtered (control)", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ functionCall: { name: "" } },
			{ functionCall: { name: "ok" } },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("ok");
	});
});
