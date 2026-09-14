import { beforeEach, describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Eighth leftover: `part.text || ""` inside maybeSaveOutputToState.
 * Matrix leftover covers null/undefined/""; AgentBuilder seventh covers
 * the same join on ask — not LlmAgent state save with 0 / false / "0".
 */
describe("LlmAgent part.text 0/false || eighth leftover", () => {
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
			label: "numeric 0 coalesces away",
			parts: [{ text: 0 as any }, { text: "kept" }],
			expected: "kept",
		},
		{
			label: "false coalesces away",
			parts: [{ text: false as any }, { text: "x" }],
			expected: "x",
		},
		{
			label: 'string "0" is kept (truthy)',
			parts: [{ text: "0" }, { text: "1" }],
			expected: "01",
		},
		{
			label: "mix 0 / false / string zero / empty",
			parts: [
				{ text: 0 as any },
				{ text: "0" },
				{ text: false as any },
				{ text: "" },
				{ text: "1" },
			],
			expected: "01",
		},
		{
			label: "all falsy non-strings → no state write",
			parts: [{ text: 0 as any }, { text: false as any }],
			expected: undefined,
		},
	])("$label", ({ parts, expected }) => {
		const agent = new LlmAgent({ name: "save_text_edge", outputKey: "out" });
		const event = save(agent, parts);
		expect(event.actions.stateDelta?.out).toBe(expected);
	});
});
