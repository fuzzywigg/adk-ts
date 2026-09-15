import { describe, expect, it } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins instruction/globalInstruction true/`"true"`/`-0`.
 * Assert ±Infinity keep via `|| ""` — residual sentinel deepen.
 */
describe("LlmAgent instruction infinity twenty-second leftover", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("instruction / globalInstruction $label kept via ||", ({ value }) => {
		const agent = new LlmAgent({
			name: "instr_inf",
			instruction: value as any,
			globalInstruction: value as any,
		});
		expect(agent.instruction).toBe(value);
		expect(agent.globalInstruction).toBe(value);
	});

	it('SameValueZero -0 instruction / globalInstruction still coalesce to ""', () => {
		const agent = new LlmAgent({
			name: "instr_neg0",
			instruction: -0 as any,
			globalInstruction: -0 as any,
		});
		expect(agent.instruction).toBe("");
		expect(agent.globalInstruction).toBe("");
	});

	it("empty-array instruction / globalInstruction kept (truthy ||)", () => {
		const empty: never[] = [];
		const agent = new LlmAgent({
			name: "instr_arr",
			instruction: empty as any,
			globalInstruction: empty as any,
		});
		expect(agent.instruction).toBe(empty);
		expect(agent.globalInstruction).toBe(empty);
	});
});
