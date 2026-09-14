import { describe, expect, it } from "vitest";
import * as planners from "../../planners";

describe("planners barrel exports", () => {
	it("exposes BasePlanner, BuiltInPlanner, and PlanReActPlanner", () => {
		expect(typeof planners.BasePlanner).toBe("function");
		expect(typeof planners.BuiltInPlanner).toBe("function");
		expect(typeof planners.PlanReActPlanner).toBe("function");
	});

	it("BuiltInPlanner builds thinking config when enabled", () => {
		const planner = new planners.BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 128 },
		});
		const request: any = { config: {} };
		planner.applyThinkingConfig(request);
		expect(request.config.thinkingConfig).toEqual({
			includeThoughts: true,
			thinkingBudget: 128,
		});
	});

	it("PlanReActPlanner returns planning instruction text", () => {
		const planner = new planners.PlanReActPlanner();
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction).toContain("/*PLANNING*/");
		expect(instruction).toContain("/*FINAL_ANSWER*/");
	});
});
