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
 * Twenty-first leftover residual deepen (complements #251 true/negzero):
 * model / instruction / includeContents / disallowTransfer* `||` —
 * POSITIVE_INFINITY / `1` / `{}` / `Object(true)` kept (AiSdkLlm /
 * SingleFlow); `"Infinity"` string → newLLM; `NaN` coalesces.
 */
describe("LlmAgent ctor posinf/nan/object-true twenty-first residual deepen", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("model $label is preserved and canonicalModel uses AiSdkLlm", ({
		value,
	}) => {
		const spy = vi.spyOn(LLMRegistry, "newLLM");
		const agent = new LlmAgent({
			name: "model_resid",
			model: value as any,
		});
		expect(agent.model).toBe(value);
		expect(agent.canonicalModel).toBeInstanceOf(AiSdkLlm);
		expect(spy).not.toHaveBeenCalled();
	});

	it('model "Infinity" is preserved and canonicalModel uses newLLM string branch', () => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: "Infinity" } as any);
		const agent = new LlmAgent({
			name: "model_str_inf",
			model: "Infinity" as any,
		});
		expect(agent.model).toBe("Infinity");
		expect(agent.canonicalModel).toEqual({ model: "Infinity" });
		expect(spy).toHaveBeenCalledWith("Infinity");
	});

	it("NaN model coalesces to empty string", () => {
		const agent = new LlmAgent({ name: "model_nan", model: Number.NaN as any });
		expect(agent.model).toBe("");
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
	])("instruction / globalInstruction $label kept", ({ value }) => {
		const agent = new LlmAgent({
			name: "instr_resid",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe(value);
		expect(agent.globalInstruction).toBe(value);
	});

	it("NaN instruction / globalInstruction coalesce to empty string", () => {
		const agent = new LlmAgent({
			name: "instr_nan",
			instruction: Number.NaN as any,
			globalInstruction: Number.NaN as any,
		});
		expect(agent.instruction).toBe("");
		expect(agent.globalInstruction).toBe("");
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
	])("includeContents $label kept (not default)", ({ value }) => {
		const agent = new LlmAgent({
			name: "inc_resid",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe(value);
	});

	it("NaN includeContents coalesces to default", () => {
		const agent = new LlmAgent({
			name: "inc_nan",
			includeContents: Number.NaN as any,
		});
		expect(agent.includeContents).toBe("default");
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
	])("disallowTransfer* $label kept and both-lock SingleFlow", ({ value }) => {
		const agent = new LlmAgent({
			name: "xfer_resid",
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(value);
		expect(agent.disallowTransferToPeers).toBe(value);
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it("NaN disallow flags unlock AutoFlow", () => {
		const agent = new LlmAgent({
			name: "xfer_nan",
			disallowTransferToParent: Number.NaN as any,
			disallowTransferToPeers: Number.NaN as any,
		});
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
		expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
	});
});
