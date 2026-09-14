import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

/**
 * Twelfth leftover: `llmRequest.config = llmRequest.config || {}`.
 * Tenth leftover covers `""`. Whitespace strings are truthy so `||` reuses
 * the primitive and assigning `.thinkingConfig` does not stick.
 */
describe("built-in-planner config whitespace string vs empty twelfth leftover edges", () => {
	it("empty string still initializes a fresh object (control)", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 2 },
		});
		const request = new LlmRequest();
		request.config = "" as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toEqual({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 2 },
		});
	});

	it.each([
		" ",
		"\t",
		"\n",
	])("whitespace config %j is truthy via || then throws on property assign", (config) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true, thinkingBudget: 2 },
		});
		const request = new LlmRequest();
		request.config = config as any;
		expect(() => planner.applyThinkingConfig(request)).toThrow(
			/Cannot create property 'thinkingConfig'/,
		);
		expect(request.config).toBe(config);
	});

	it("NaN config is falsy via || so it is replaced with {}", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false },
		});
		const request = new LlmRequest();
		request.config = Number.NaN as any;
		planner.applyThinkingConfig(request);
		expect(request.config).toEqual({
			thinkingConfig: { includeThoughts: false },
		});
	});
});
