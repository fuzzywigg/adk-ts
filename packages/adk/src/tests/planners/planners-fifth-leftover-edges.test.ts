import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("planners fifth leftover edges (TOKENMAXX)", () => {
	it("PlanReAct stops consecutive FC window on first non-FC after mid named", () => {
		const planner = new PlanReActPlanner();
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REASONING*/ r" },
			{ functionCall: { name: "a", args: { i: 1 } } },
			{ functionCall: { name: "b", args: { i: 2 } } },
			{ text: "break" },
			{ functionCall: { name: "c", args: { i: 3 } } },
		]);
		expect(parts?.map((p) => p.functionCall?.name ?? p.text)).toEqual([
			"/*REASONING*/ r",
			"a",
			"b",
		]);
	});

	it("PlanReAct multiple FINAL_ANSWER tags use last occurrence", () => {
		const planner = new PlanReActPlanner();
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*FINAL_ANSWER*/ first /*FINAL_ANSWER*/ second answer",
			},
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toBe("/*FINAL_ANSWER*/ first /*FINAL_ANSWER*/");
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" second answer");
	});

	it("PlanReAct REPLANNING tag marks thought like PLANNING", () => {
		const planner = new PlanReActPlanner();
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*REPLANNING*/ revise step 2" },
			{ functionCall: { name: "retry_tool", args: {} } },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].functionCall?.name).toBe("retry_tool");
	});

	it("BuiltInPlanner preserves nested config object identity for unrelated keys", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 16 },
		});
		const request = new LlmRequest();
		const nested = { stopSequences: ["END"], temperature: 0 };
		request.config = nested as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toBe(nested);
		expect((request.config as any).thinkingConfig.thinkingBudget).toBe(16);
	});

	it("BuiltInPlanner skips apply for empty object thinkingConfig still truthy", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: {} as any,
		});
		const request = new LlmRequest();
		request.config = { temperature: 1 } as any;
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toEqual({});
		expect((request.config as any).temperature).toBe(1);
	});

	it("instruction contains available-tools and clarification clauses", () => {
		const instruction = new PlanReActPlanner().buildPlanningInstruction(
			{} as any,
			{} as any,
		);
		expect(instruction).toContain("Available Tools");
		expect(instruction).toContain("ask for clarification");
		expect(instruction).toContain("prefer using the information available");
	});
});
