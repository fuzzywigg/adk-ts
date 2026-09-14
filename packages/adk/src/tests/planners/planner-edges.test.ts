import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

describe("PlanReActPlanner leftover edges", () => {
	const planner = new PlanReActPlanner();

	it("buildPlanningInstruction returns the full NL instruction golden snapshot", () => {
		const instruction = planner.buildPlanningInstruction(
			{} as any,
			new LlmRequest(),
		);
		expect(instruction).toContain("/*PLANNING*/");
		expect(instruction).toContain("/*REASONING*/");
		expect(instruction).toContain("/*ACTION*/");
		expect(instruction).toContain("/*FINAL_ANSWER*/");
		expect(instruction).toContain("/*REPLANNING*/");
		expect(instruction).toContain("VERY IMPORTANT instruction");
		expect(instruction).toContain("Available Tools:");
		expect(instruction).toMatch(/numbered list/);
		expect(instruction.length).toBeGreaterThan(500);
	});

	it("preserves parts that have both text and functionCall by stopping at functionCall", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*PLANNING*/ ahead", functionCall: { name: "mixed", args: {} } },
			{ text: "after" },
		]);
		expect(parts).toHaveLength(1);
		expect(parts?.[0].functionCall?.name).toBe("mixed");
		expect(parts?.[0].text).toBe("/*PLANNING*/ ahead");
	});

	it("splits on the last FINAL_ANSWER occurrence when the tag repeats", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{
				text: "/*REASONING*/ a /*FINAL_ANSWER*/ mid /*FINAL_ANSWER*/ end",
			},
		]);
		expect(parts).toHaveLength(2);
		expect(parts?.[0].text).toBe(
			"/*REASONING*/ a /*FINAL_ANSWER*/ mid /*FINAL_ANSWER*/",
		);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].text).toBe(" end");
		expect(parts?.[1].thought).toBeUndefined();
	});

	it("_splitByLastPattern returns full text when separator missing", () => {
		expect((planner as any)._splitByLastPattern("abc", "ZZZ")).toEqual([
			"abc",
			"",
		]);
	});

	it("marks ACTION and REPLANNING tagged texts as thought", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*ACTION*/ call tools" },
			{ text: "/*REPLANNING*/ revise" },
		]);
		expect(parts?.[0].thought).toBe(true);
		expect(parts?.[1].thought).toBe(true);
	});

	it("returns undefined for empty responseParts array", () => {
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
	});

	it("passes through non-text parts without functionCall as-is", () => {
		const parts = planner.processPlanningResponse({} as any, [
			{ inlineData: { data: "x", mimeType: "text/plain" } } as any,
		]);
		expect(parts).toHaveLength(1);
		expect((parts?.[0] as any).inlineData?.data).toBe("x");
	});
});

describe("BuiltInPlanner leftover edges", () => {
	it("applies full ThinkingConfig field matrix onto request config", () => {
		const thinkingConfig = {
			includeThoughts: true,
			thinkingBudget: 256,
			thinkingLevel: "high",
			extraVendorField: { nested: true },
		} as any;
		const planner = new BuiltInPlanner({ thinkingConfig });
		const request = new LlmRequest();
		request.config = {
			temperature: 0,
			candidateCount: 1,
			stopSequences: ["END"],
		} as any;

		planner.applyThinkingConfig(request);

		expect(request.config).toMatchObject({
			temperature: 0,
			candidateCount: 1,
			stopSequences: ["END"],
			thinkingConfig,
		});
		expect(planner.thinkingConfig).toBe(thinkingConfig);
	});

	it("overwrites a previous thinkingConfig on the request", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 10 },
		});
		const request = new LlmRequest();
		request.config = {
			thinkingConfig: { includeThoughts: false, thinkingBudget: 1 },
		} as any;

		planner.applyThinkingConfig(request);

		expect((request.config as any).thinkingConfig).toEqual({
			includeThoughts: true,
			thinkingBudget: 10,
		});
	});

	it("processPlanningResponse ignores responseParts content", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		expect(
			planner.processPlanningResponse({} as any, [
				{ text: "/*PLANNING*/ ignored" },
				{ functionCall: { name: "x", args: {} } },
			]),
		).toBeUndefined();
	});
});
