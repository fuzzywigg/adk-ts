import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

/**
 * Thirteenth leftover: `if (this.thinkingConfig)` — whitespace string is
 * truthy and assigned; empty string / 0 / false skip. Tenth leftover pinned
 * config || {} when thinkingConfig is already a real object.
 */
describe("built-in-planner thinkingConfig falsy vs whitespace thirteenth leftover edges", () => {
	it("whitespace-string thinkingConfig is assigned", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = " " as any;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toBe(" ");
	});

	it.each([
		{ label: "empty string", value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("$label thinkingConfig skips apply", ({ value }) => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = value as any;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect(request.config).toBeUndefined();
	});

	it('string "0" thinkingConfig is truthy and assigned', () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = "0" as any;
		const request = new LlmRequest();
		planner.applyThinkingConfig(request);
		expect((request.config as any).thinkingConfig).toBe("0");
	});
});
