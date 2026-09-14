import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

describe("BuiltInPlanner remainder edges (TOKENMAXX after #153)", () => {
	it.each([
		{ thinkingConfig: 1 as any, label: "number 1" },
		{ thinkingConfig: "budget" as any, label: "string" },
		{ thinkingConfig: true as any, label: "boolean true" },
		{ thinkingConfig: [] as any, label: "empty array" },
	])("applies truthy non-object thinkingConfig ($label)", ({
		thinkingConfig,
	}) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = thinkingConfig;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toBe(thinkingConfig);
	});

	it("repeated apply overwrites thinkingConfig in place on same config object", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 8 },
		});
		const request = new LlmRequest();
		request.config = { temperature: 0.2 } as any;
		const configRef = request.config;
		planner.applyThinkingConfig(request);
		planner.thinkingConfig = { includeThoughts: false, thinkingBudget: 99 };
		planner.applyThinkingConfig(request);
		expect(request.config).toBe(configRef);
		expect(request.config).toMatchObject({
			temperature: 0.2,
			thinkingConfig: { includeThoughts: false, thinkingBudget: 99 },
		});
	});

	it("initializes config from null via || {}", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		const request = new LlmRequest();
		request.config = null as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toEqual({
			thinkingConfig: { includeThoughts: true },
		});
	});

	it("mutates Object.create(null) config without inheriting Object.prototype", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false },
		});
		const request = new LlmRequest();
		request.config = Object.create(null);
		(request.config as any).topP = 0.9;
		planner.applyThinkingConfig(request);
		expect(Object.getPrototypeOf(request.config)).toBeNull();
		expect((request.config as any).topP).toBe(0.9);
		expect((request.config as any).thinkingConfig).toEqual({
			includeThoughts: false,
		});
	});

	it("shares thinkingConfig object identity onto the request", () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 4 };
		const planner = new BuiltInPlanner({ thinkingConfig });
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toBe(thinkingConfig);
	});

	it.each([
		{ ctx: null, parts: null },
		{ ctx: undefined, parts: [] },
		{ ctx: { agentName: "x" }, parts: [{ text: "/*PLANNING*/ y" }] },
	])("build/process always undefined for ctx/parts combo", ({ ctx, parts }) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		expect(
			planner.buildPlanningInstruction(ctx as any, new LlmRequest()),
		).toBeUndefined();
		expect(
			planner.processPlanningResponse(ctx as any, parts as any),
		).toBeUndefined();
	});
});
