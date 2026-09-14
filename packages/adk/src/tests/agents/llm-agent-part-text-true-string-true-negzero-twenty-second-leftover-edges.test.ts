import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after #251):
 * eighth pins `part.text || ""` for `0`/`false`/`"0"`. Assert boolean `true`
 * / `"true"` / ±Infinity keep via `||`; SameValueZero `-0` coalesces away;
 * `[]` is truthy but ToStrings empty on join — residual true asymmetry after
 * twentieth tools/outputKey tip.
 */
describe("LlmAgent part.text true/string-true/negzero twenty-second leftover", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	function save(agent: LlmAgent, parts: any[]): Event {
		const event = new Event({
			author: agent.name,
			content: { parts },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it.each([
		{
			label: "boolean true",
			parts: [{ text: true as any }, { text: "x" }],
			expected: "truex",
		},
		{
			label: '"true"',
			parts: [{ text: "true" }, { text: "x" }],
			expected: "truex",
		},
		{
			label: "POSITIVE_INFINITY",
			parts: [{ text: Number.POSITIVE_INFINITY as any }, { text: "x" }],
			expected: "Infinityx",
		},
		{
			label: "NEGATIVE_INFINITY",
			parts: [{ text: Number.NEGATIVE_INFINITY as any }, { text: "x" }],
			expected: "-Infinityx",
		},
	])("$label part.text is kept via ||", ({ parts, expected }) => {
		const agent = new LlmAgent({ name: "save_true_text", outputKey: "out" });
		const event = save(agent, parts);
		expect(event.actions.stateDelta?.out).toBe(expected);
	});

	it("SameValueZero -0 part.text coalesces away via ||", () => {
		const agent = new LlmAgent({ name: "save_neg0_text", outputKey: "out" });
		const event = save(agent, [{ text: -0 as any }, { text: "kept" }]);
		expect(event.actions.stateDelta?.out).toBe("kept");
	});

	it("empty-array part.text is truthy but joins to empty (no write alone)", () => {
		const agent = new LlmAgent({ name: "save_arr_text", outputKey: "out" });
		const event = save(agent, [{ text: [] as any }]);
		expect(event.actions.stateDelta?.out).toBeUndefined();
	});

	it('string "false" still kept (eighth control asymmetry)', () => {
		const agent = new LlmAgent({ name: "save_false_text", outputKey: "out" });
		const event = save(agent, [{ text: "false" }, { text: "1" }]);
		expect(event.actions.stateDelta?.out).toBe("false1");
	});
});
