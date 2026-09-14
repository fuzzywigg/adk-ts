import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
import { AiSdkLlm } from "../../models/ai-sdk";
import { LLMRegistry } from "../../models/llm-registry";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

vi.mock("../../flows/llm-flows", () => ({
	SingleFlow: vi.fn(function () {
		this.runAsync = vi.fn(async function* () {});
	}),
	AutoFlow: vi.fn(function () {
		this.runAsync = vi.fn(async function* () {});
	}),
}));

/**
 * Twenty-first leftover: ninth pins ctor `"0"`/`"false"` keep. Assert
 * boolean `true` / `"true"` keep for model/instruction/includeContents /
 * disallowTransfer*; SameValueZero `-0` coalesces. canonicalModel true
 * asymmetry: boolean `true` → AiSdkLlm LanguageModel branch; `"true"` →
 * newLLM string branch — residual after twentieth tools/outputKey tip.
 */
describe("LlmAgent ctor true/string-true/negzero twenty-first leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("model boolean true is preserved and canonicalModel uses AiSdkLlm branch", () => {
		const spy = vi.spyOn(LLMRegistry, "newLLM");
		const agent = new LlmAgent({
			name: "model_bool_true",
			model: true as any,
		});
		expect(agent.model).toBe(true);
		expect(agent.canonicalModel).toBeInstanceOf(AiSdkLlm);
		expect(spy).not.toHaveBeenCalled();
	});

	it('model "true" is preserved and canonicalModel uses newLLM string branch', () => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "true" } as any);
		const agent = new LlmAgent({
			name: "model_str_true",
			model: "true" as any,
		});
		expect(agent.model).toBe("true");
		expect(agent.canonicalModel).toEqual({ model: "true" });
		expect(spy).toHaveBeenCalledWith("true");
	});

	it("SameValueZero -0 model coalesces to empty string", () => {
		const agent = new LlmAgent({ name: "model_neg0", model: -0 as any });
		expect(agent.model).toBe("");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("instruction / globalInstruction $label kept", ({ value }) => {
		const agent = new LlmAgent({
			name: "instr_true",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe(value);
		expect(agent.globalInstruction).toBe(value);
	});

	it('SameValueZero -0 instruction / globalInstruction coalesce to ""', () => {
		const agent = new LlmAgent({
			name: "instr_neg0",
			instruction: -0 as any,
			globalInstruction: -0 as any,
		});
		expect(agent.instruction).toBe("");
		expect(agent.globalInstruction).toBe("");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("includeContents $label kept (not default)", ({ value }) => {
		const agent = new LlmAgent({
			name: "inc_true",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe(value);
	});

	it("SameValueZero -0 includeContents coalesces to default", () => {
		const agent = new LlmAgent({
			name: "inc_neg0",
			includeContents: -0 as any,
		});
		expect(agent.includeContents).toBe("default");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("disallowTransfer* $label kept and both-lock SingleFlow", ({ value }) => {
		const agent = new LlmAgent({
			name: "xfer_true",
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(value);
		expect(agent.disallowTransferToPeers).toBe(value);
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it("SameValueZero -0 disallow flags unlock AutoFlow", () => {
		const agent = new LlmAgent({
			name: "xfer_neg0",
			disallowTransferToParent: -0 as any,
			disallowTransferToPeers: -0 as any,
		});
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
		expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
	});

	it('string "false" disallow still locks SingleFlow (ninth control)', () => {
		const agent = new LlmAgent({
			name: "xfer_false",
			disallowTransferToParent: "false" as any,
			disallowTransferToPeers: "false" as any,
		});
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});
});
