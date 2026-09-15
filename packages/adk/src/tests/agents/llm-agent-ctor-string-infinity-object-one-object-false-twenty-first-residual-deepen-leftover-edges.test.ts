import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { SingleFlow } from "../../flows/llm-flows";
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
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * model/instruction/includeContents/disallowTransfer* `||` — string `"Infinity"`
 * keeps and uses `newLLM` (string path); `Object(1)` / `Object(false)` keep via
 * AiSdkLlm; boxed false still locks SingleFlow (truthy).
 */
describe("LlmAgent ctor string-infinity/object-one/object-false twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('string "Infinity" model is preserved and canonicalModel uses newLLM', () => {
		const fake = { model: "Infinity" } as any;
		const spy = vi.spyOn(LLMRegistry, "newLLM").mockReturnValue(fake);
		const agent = new LlmAgent({
			name: "model_str_inf",
			model: "Infinity" as any,
		});
		expect(agent.model).toBe("Infinity");
		expect(agent.canonicalModel).toBe(fake);
		expect(spy).toHaveBeenCalledWith("Infinity");
	});

	it.each([
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("model $label is preserved and canonicalModel uses AiSdkLlm", ({
		value,
	}) => {
		const spy = vi.spyOn(LLMRegistry, "newLLM");
		const agent = new LlmAgent({
			name: "model_boxed",
			model: value as any,
		});
		expect(agent.model).toBe(value);
		expect(agent.canonicalModel).toBeInstanceOf(AiSdkLlm);
		expect(spy).not.toHaveBeenCalled();
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("instruction / globalInstruction $label kept", ({ value }) => {
		const agent = new LlmAgent({
			name: "instr_str_inf",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe(value);
		expect(agent.globalInstruction).toBe(value);
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("includeContents $label kept (not default)", ({ value }) => {
		const agent = new LlmAgent({
			name: "inc_str_inf",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe(value);
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("disallowTransfer* $label kept and both-lock SingleFlow", ({ value }) => {
		const agent = new LlmAgent({
			name: "xfer_str_inf",
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(value);
		expect(agent.disallowTransferToPeers).toBe(value);
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});
});
