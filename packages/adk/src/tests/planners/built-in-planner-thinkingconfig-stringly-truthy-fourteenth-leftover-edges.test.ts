import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

/**
 * Fourteenth leftover: if (this.thinkingConfig) — stringly "false" / "null"
 * are truthy and assigned; real false/null skip (thirteenth).
 */
describe("built-in-planner thinkingConfig stringly-truthy fourteenth leftover edges", () => {
	it.each([
		"false",
		"null",
		"undefined",
		"NaN",
	])("string %j thinkingConfig is assigned", (value) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = value as any;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toBe(value);
	});

	it("real false still skips (thirteenth control)", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = false as any;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect(request.config).toBeUndefined();
	});

	it("empty object {} is truthy and assigned", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = {} as any;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toEqual({});
	});
});
