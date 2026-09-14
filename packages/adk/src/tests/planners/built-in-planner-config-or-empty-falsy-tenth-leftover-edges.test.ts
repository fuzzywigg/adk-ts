import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

/**
 * Tenth leftover: llmRequest.config = llmRequest.config || {} — null is covered;
 * false / 0 / "" should also initialize a fresh {} then attach thinkingConfig.
 */
describe("built-in-planner config-or-empty falsy tenth leftover edges", () => {
	it.each([
		{ label: "false", config: false as any },
		{ label: "0", config: 0 as any },
		{ label: "empty string", config: "" as any },
		{ label: "undefined", config: undefined as any },
	])("applyThinkingConfig initializes config from $label via || {}", ({
		config,
	}) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 4 },
		});
		const request = new LlmRequest();
		request.config = config;
		planner.applyThinkingConfig(request);
		expect(request.config).toEqual({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 4 },
		});
	});

	it("truthy empty object config is reused (identity preserved)", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false },
		});
		const request = new LlmRequest();
		const existing = { temperature: 0.1 } as any;
		request.config = existing;
		planner.applyThinkingConfig(request);
		expect(request.config).toBe(existing);
		expect(request.config).toMatchObject({
			temperature: 0.1,
			thinkingConfig: { includeThoughts: false },
		});
	});

	it("skips entirely when thinkingConfig itself is falsy", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = null as any;
		const request = new LlmRequest();
		request.config = false as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toBe(false);
	});
});
