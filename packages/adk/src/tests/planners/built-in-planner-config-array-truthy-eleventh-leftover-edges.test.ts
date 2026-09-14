import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

/**
 * Eleventh leftover: llmRequest.config = llmRequest.config || {} — empty
 * array is truthy so thinkingConfig is attached to the Array instance.
 * Distinct from tenth falsy false/0/""/undefined → fresh {}.
 */
describe("built-in-planner config-array-truthy eleventh leftover edges", () => {
	it("reuses empty array config identity and attaches thinkingConfig", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 8 },
		});
		const request = new LlmRequest();
		const existing: any[] = [];
		request.config = existing as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toBe(existing);
		expect(Array.isArray(request.config)).toBe(true);
		expect((request.config as any).thinkingConfig).toEqual({
			includeThoughts: true,
			thinkingBudget: 8,
		});
	});

	it.each([
		{ label: "non-empty array", config: [1] as any },
		{ label: "sparse array", config: [undefined, undefined] as any },
	])("truthy $label config is also reused via || {}", ({ config }) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false },
		});
		const request = new LlmRequest();
		request.config = config;
		planner.applyThinkingConfig(request);
		expect(request.config).toBe(config);
		expect((request.config as any).thinkingConfig).toEqual({
			includeThoughts: false,
		});
	});

	it("falsy false still initializes fresh {} (tenth control)", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		const request = new LlmRequest();
		request.config = false as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toEqual({
			thinkingConfig: { includeThoughts: true },
		});
		expect(Array.isArray(request.config)).toBe(false);
	});
});
