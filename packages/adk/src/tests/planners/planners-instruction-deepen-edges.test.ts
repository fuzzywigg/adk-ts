import { describe, expect, it } from "vitest";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("planners instruction deepen edges (TOKENMAXX after #153)", () => {
	const planner = new PlanReActPlanner();

	it.each([
		{
			needle: "leverage the available tools to gather the information",
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
			needle: "precise and follow query formatting requirements",
			label: "final answer precision",
		},
		{
			needle: "explicitly defined in the function declarations",
			label: "tool usage constraints",
		},
		{
			needle: "VERY IMPORTANT instruction that you MUST follow",
			label: "user-input importance",
		},
		{
			needle: "/*REPLANNING*/",
			label: "replanning tag in planning preamble",
		},
		{
			needle: "prefer using the information available in the context",
			label: "prefer context over repeated tool use",
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

	it("keeps stable tag order across planning/action/reasoning/final", () => {
		const instruction = planner.buildPlanningInstruction({} as any, {} as any);
		expect(instruction.indexOf("/*PLANNING*/")).toBeLessThan(
			instruction.indexOf("/*ACTION*/"),
		);
		expect(instruction.indexOf("/*ACTION*/")).toBeLessThan(
			instruction.indexOf("/*REASONING*/"),
		);
		expect(instruction.indexOf("/*REASONING*/")).toBeLessThan(
			instruction.indexOf("/*FINAL_ANSWER*/"),
		);
	});
});
