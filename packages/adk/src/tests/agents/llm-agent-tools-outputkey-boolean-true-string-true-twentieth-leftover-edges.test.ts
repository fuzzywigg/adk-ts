import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Twentieth leftover: eighteenth pins tools `"0"`/`"false"` keep; outputKey
 * `"false"` writes. Assert `tools || []` keeps boolean `true` / `"true"`;
 * `-0` coalesces to `[]`. outputKey `"true"` / boolean `true` write under
 * key `"true"`.
 */
describe("LlmAgent tools/outputKey boolean-true/string-true twentieth leftover", () => {
	function save(agent: LlmAgent, text: string): Event {
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("tools $label is kept via || (not coalesced to [])", ({ value }) => {
		const agent = new LlmAgent({
			name: "tools_true",
			tools: value as any,
		});
		expect(agent.tools).toBe(value);
		expect(Array.isArray(agent.tools)).toBe(false);
	});

	it("tools SameValueZero -0 still coalesces to []", () => {
		const agent = new LlmAgent({ name: "tools_neg0", tools: -0 as any });
		expect(agent.tools).toEqual([]);
	});

	it('outputKey "true" is truthy and writes under key "true"', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "true" });
		const event = save(agent, "kept-under-true");
		expect(event.actions.stateDelta?.true).toBe("kept-under-true");
	});

	it('outputKey boolean true coerces to key "true" on stateDelta', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: true as any });
		const event = save(agent, "bool-true-key");
		expect(event.actions.stateDelta?.true).toBe("bool-true-key");
	});

	it('outputKey "false" still writes (eighteenth control)', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "false" });
		const event = save(agent, "kept-under-false");
		expect(event.actions.stateDelta?.false).toBe("kept-under-false");
	});
});
