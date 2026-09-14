import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("planners instruction remainder edges (TOKENMAXX)", () => {
	const planner = new PlanReActPlanner();

	it.each([
		{
			needle: "leverage the available tools",
			label: "high-level tool leverage",
		},
		{
			needle: "decomposed steps as a numbered list",
			label: "planning numbered list",
		},
		{
			needle: "summary of the current trajectory",
			label: "reasoning trajectory",
		},
		{
			needle: "precise and follow query formatting",
			label: "final answer precision",
		},
		{
			needle: "cannot use any parameters, fields, or capabilities",
			label: "tool usage constraints",
		},
		{
			needle: "MUST follow in addition to the above instructions",
			label: "user-input importance",
		},
	])("instruction contains $label", ({ needle }) => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction).toContain(needle);
	});

	it("joins preambles with double newlines between sections", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		const sections = instruction
			.split("\n\n")
			.filter((s) => s.trim().length > 0);
		expect(sections.length).toBeGreaterThanOrEqual(6);
	});

	it("ignores llmRequest / readonlyContext arguments for instruction content", () => {
		const a = planner.buildPlanningInstruction(
			{ agentName: "alpha" } as any,
			{ model: "m1" } as any,
		);
		const b = planner.buildPlanningInstruction(
			{ agentName: "beta" } as any,
			{ model: "m2" } as any,
		);
		expect(a).toBe(b);
	});
});
