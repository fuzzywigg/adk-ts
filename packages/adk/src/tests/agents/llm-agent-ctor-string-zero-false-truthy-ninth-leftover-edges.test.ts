import { beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Ninth leftover: ctor `model`/`instruction`/`globalInstruction`/`includeContents`
 * / `disallowTransfer* ||` keep string `"0"` / `"false"`. Eighth leftover only
 * pins numeric `0` / boolean `false` / `""` coalesce paths.
 */
describe("LlmAgent ctor string-zero/false truthy ninth leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])('model $label is preserved (no || "")', ({ value }) => {
		const spy = vi
			.spyOn(LLMRegistry, "newLLM")
			.mockReturnValue({ model: value } as any);
		const agent = new LlmAgent({ name: "model_str", model: value as any });
		expect(agent.model).toBe(value);
		expect(agent.canonicalModel).toEqual({ model: value });
		expect(spy).toHaveBeenCalledWith(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("instruction / globalInstruction $label kept", ({ value }) => {
		const agent = new LlmAgent({
			name: "instr_str",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe(value);
		expect(agent.globalInstruction).toBe(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("includeContents $label kept (not default)", ({ value }) => {
		const agent = new LlmAgent({
			name: "inc_str",
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("disallowTransfer* $label kept and both-lock SingleFlow", ({ value }) => {
		const agent = new LlmAgent({
			name: "xfer_str",
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(value);
		expect(agent.disallowTransferToPeers).toBe(value);
		expect(agent["llmFlow"]).toBeInstanceOf(SingleFlow);
	});

	it("numeric 0 model still coalesces to empty (eighth control)", () => {
		const agent = new LlmAgent({ name: "model_num", model: 0 as any });
		expect(agent.model).toBe("");
	});

	it("numeric 0 disallow flags still unlock AutoFlow (eighth control)", () => {
		const agent = new LlmAgent({
			name: "xfer_num",
			disallowTransferToParent: 0 as any,
			disallowTransferToPeers: 0 as any,
		});
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
		expect(agent["llmFlow"]).toBeInstanceOf(AutoFlow);
	});
});
