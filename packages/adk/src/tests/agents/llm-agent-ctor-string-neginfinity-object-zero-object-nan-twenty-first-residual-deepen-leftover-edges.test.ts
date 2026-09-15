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
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * model/instruction/includeContents/disallowTransfer* `||` — string `"-Infinity"`
 * keeps and uses `newLLM` (string path); `Object(0)` / `Object(NaN)` keep via
 * AiSdkLlm; boxed zero/NaN still lock SingleFlow (truthy).
 */
describe("LlmAgent ctor string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('string "-Infinity" model is preserved and canonicalModel uses newLLM', () => {
		const fake = { model: "-Infinity" } as any;
		const spy = vi.spyOn(LLMRegistry, "newLLM").mockReturnValue(fake);
		const agent = new LlmAgent({
			name: "model_str_neginf",
			model: "-Infinity" as any,
		});
		expect(agent.model).toBe("-Infinity");
		expect(agent.canonicalModel).toBe(fake);
		expect(spy).toHaveBeenCalledWith("-Infinity");
	});

	it.each([
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
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
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("instruction / globalInstruction $label kept", ({ value }) => {
		const agent = new LlmAgent({
			name: "instr_str_neginf",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe(value);
		expect(agent.globalInstruction).toBe(value);
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("includeContents $label kept (not default)", ({ value }) => {
		const agent = new LlmAgent({
			name: "inc_str_neginf",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe(value);
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("disallowTransfer* $label kept and both-lock SingleFlow", ({ value }) => {
		const agent = new LlmAgent({
			name: "xfer_str_neginf",
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(value);
		expect(agent.disallowTransferToPeers).toBe(value);
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});
});
