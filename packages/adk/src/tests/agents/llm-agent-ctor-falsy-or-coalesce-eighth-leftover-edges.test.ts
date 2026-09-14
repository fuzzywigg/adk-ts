import { describe, expect, it } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";

/**
 * Eighth leftover: ctor `model/instruction/globalInstruction || ""`,
 * `tools || []`, and `disallowTransfer* || false` only coalesced ""/undefined
 * in prior leftovers. `0` / `false` / `null` also hit `||`.
 */
describe("LlmAgent ctor falsy || coalesce eighth leftover", () => {
	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("model $label coalesces to empty string via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: `model_${String(value)}`,
			model: value as any,
		});
		expect(agent.model).toBe("");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("instruction $label coalesces to empty string via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: `instr_${String(value)}`,
			instruction: value as any,
		});
		expect(agent.instruction).toBe("");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("globalInstruction $label coalesces to empty string via ||", ({
		value,
	}) => {
		const agent = new LlmAgent({
			name: `glob_${String(value)}`,
			globalInstruction: value as any,
		});
		expect(agent.globalInstruction).toBe("");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("tools $label coalesces to [] via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: `tools_${String(value)}`,
			tools: value as any,
		});
		expect(agent.tools).toEqual([]);
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
		{ label: "null", value: null },
	])("disallowTransfer flags $label coalesce to false via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: `flags_${String(value)}`,
			disallowTransferToParent: value as any,
			disallowTransferToPeers: value as any,
		});
		expect(agent.disallowTransferToParent).toBe(false);
		expect(agent.disallowTransferToPeers).toBe(false);
	});

	it('whitespace model " " is truthy and preserved (not coalesced)', () => {
		const agent = new LlmAgent({
			name: "ws_model",
			model: " " as any,
		});
		expect(agent.model).toBe(" ");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "null", value: null },
	])("includeContents $label coalesces to default via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: `inc_${String(value)}`,
			includeContents: value as any,
		});
		expect(agent.includeContents).toBe("default");
	});
});
