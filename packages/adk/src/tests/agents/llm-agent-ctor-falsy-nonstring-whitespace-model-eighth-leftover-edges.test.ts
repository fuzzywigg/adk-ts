import { beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { LlmAgent } from "../../agents/llm-agent";
import { AutoFlow, SingleFlow } from "../../flows/llm-flows";
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

class ShellAgent extends BaseAgent {
	protected async *runAsyncImpl() {}
	protected async *runLiveImpl() {}
}

/**
 * Eighth leftover: ctor `model/instruction/globalInstruction || ""`,
 * `tools || []`, `disallowTransfer* || false`, `includeContents || "default"`
 * with falsy non-strings; whitespace model is truthy for canonicalModel.
 */
describe("LlmAgent ctor falsy non-string / whitespace model eighth leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
		{ label: "NaN", value: Number.NaN },
	])("model $label coalesces via || to empty string", ({ value }) => {
		const agent = new LlmAgent({ name: "model_falsy", model: value as any });
		expect(agent.model).toBe("");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("instruction / globalInstruction $label coalesce to empty", ({
		value,
	}) => {
		const agent = new LlmAgent({
			name: "instr_falsy",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe("");
		expect(agent.globalInstruction).toBe("");
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
	])("tools $label coalesces via || to []", ({ value }) => {
		const agent = new LlmAgent({ name: "tools_falsy", tools: value as any });
		expect(agent.tools).toEqual([]);
	});

	it.each([
		{ label: "0", value: 0, expected: false },
		{ label: '""', value: "", expected: false },
		{ label: "null", value: null, expected: false },
		{ label: "1", value: 1, expected: 1 },
		{ label: '"yes"', value: "yes", expected: "yes" },
	])("disallowTransfer* $label via || false → $expected", ({
		value,
		expected,
	}) => {
		const agent = new LlmAgent({
			name: "xfer_falsy",
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(expected);
		expect(agent.disallowTransferToPeers).toBe(expected);
	});

	it("truthy non-boolean disallow flags select SingleFlow (both locked)", () => {
		const agent = new LlmAgent({
			name: "xfer_truthy_lock",
			disallowTransferToParent: 1 as any,
			disallowTransferToPeers: "yes" as any,
		});
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it("falsy disallow flags leave AutoFlow unlocked", () => {
		const agent = new LlmAgent({
			name: "xfer_falsy_auto",
			disallowTransferToParent: 0 as any,
			disallowTransferToPeers: "" as any,
		});
		expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "NaN", value: Number.NaN },
	])("includeContents $label coalesces to default via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: "inc_num",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe("default");
	});

	it('whitespace model is truthy so canonicalModel calls LLMRegistry.newLLM(" ")', () => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: " " } as any);
		const agent = new LlmAgent({ name: "ws_model", model: " " });
		expect(agent.model).toBe(" ");
		expect(agent.canonicalModel).toEqual({ model: " " });
		expect(spy).toHaveBeenCalledWith(" ");
	});

	it("empty model still walks ancestors / throws (control vs whitespace)", () => {
		const orphan = new LlmAgent({ name: "empty_model", model: "" });
		expect(() => orphan.canonicalModel).toThrow(/No model found/);

		vi.spyOn(LLMRegistry, "newLLM").mockReturnValue({
			model: "parent-model",
		} as any);
		const parent = new LlmAgent({
			name: "parent_ws",
			model: "parent-model",
		});
		const shell = new ShellAgent({ name: "shell_ws", description: "" });
		const child = new LlmAgent({ name: "child_empty", model: "" });
		(shell as any).parentAgent = parent;
		(child as any).parentAgent = shell;
		expect(child.canonicalModel).toEqual({ model: "parent-model" });
	});
});
