import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { PlanReActPlanner } from "../../planners/plan-re-act-planner";

/**
 * Nineteenth leftover (planners residual): thinkingConfig NaN falsy skip,
 * FINAL_ANSWER trailer "0", responseParts truthy non-array length-0.
 */
describe("planners thinkingConfig/final-answer/nonarray nineteenth leftover", () => {
	it("thinkingConfig NaN is falsy so config stays unset", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: Number.NaN as any,
		});
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect(request.config).toBeUndefined();
	});

	it('thinkingConfig "0" is truthy and assigned', () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: "0" as any,
		});
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any)?.thinkingConfig).toBe("0");
	});

	it('FINAL_ANSWER trailer "0" is truthy and emitted', () => {
		const planner = new PlanReActPlanner();
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/0" },
		]);
		expect(parts?.some((p) => p.text === "0")).toBe(true);
	});

	it("empty FINAL_ANSWER trailer is omitted", () => {
		const planner = new PlanReActPlanner();
		const parts = planner.processPlanningResponse({} as any, [
			{ text: "/*FINAL_ANSWER*/" },
		]);
		expect(parts?.every((p) => p.text !== "")).toBe(true);
	});

	it("truthy non-array {length:0} responseParts early-returns undefined", () => {
		const planner = new PlanReActPlanner();
		expect(
			planner.processPlanningResponse({} as any, { length: 0 } as any),
		).toBeUndefined();
	});

	it("real empty array still returns undefined (control)", () => {
		const planner = new PlanReActPlanner();
		expect(planner.processPlanningResponse({} as any, [])).toBeUndefined();
	});
});
