import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LLMRegistry } from "../../models/llm-registry";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins model true/`"true"`/`-0`. Assert ±Infinity keep via
 * `|| ""` and canonicalModel AiSdkLlm branch (non-string truthy) —
 * residual sentinel deepen.
 */
describe("LlmAgent model infinity twenty-second leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("model $label is preserved and canonicalModel uses AiSdkLlm branch", ({
		value,
	}) => {
		const spy = vi.spyOn(LLMRegistry, "newLLM");
		const agent = new LlmAgent({
			name: "model_inf",
			model: value as any,
		});
		expect(agent.model).toBe(value);
		expect(agent.canonicalModel).toBeInstanceOf(AiSdkLlm);
		expect(spy).not.toHaveBeenCalled();
	});

	it("empty-array model is preserved and uses AiSdkLlm branch", () => {
		const empty: never[] = [];
		const spy = vi.spyOn(LLMRegistry, "newLLM");
		const agent = new LlmAgent({
			name: "model_arr",
			model: empty as any,
		});
		expect(agent.model).toBe(empty);
		expect(agent.canonicalModel).toBeInstanceOf(AiSdkLlm);
		expect(spy).not.toHaveBeenCalled();
	});

	it("SameValueZero -0 model still coalesces to empty string", () => {
		const agent = new LlmAgent({ name: "model_neg0", model: -0 as any });
		expect(agent.model).toBe("");
	});
});
