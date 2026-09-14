import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Eighteenth leftover: eighth leftover tools falsy→[]; ninth ctor skipped tools;
 * seventh leftover outputKey `"0"`/`""` only. Assert `tools || []` keeps `"0"` /
 * `"false"`, and `outputKey: "false"` writes under key `"false"`.
 */
describe("LlmAgent tools/outputKey string-false eighteenth leftover", () => {
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
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("tools $label is kept via || (not coalesced to [])", ({ value }) => {
		const agent = new LlmAgent({
			name: "tools_str",
			tools: value as any,
		});
		expect(agent.tools).toBe(value);
		expect(Array.isArray(agent.tools)).toBe(false);
	});

	it("tools numeric 0 still coalesces to [] (eighth control)", () => {
		const agent = new LlmAgent({ name: "tools_num", tools: 0 as any });
		expect(agent.tools).toEqual([]);
	});

	it('outputKey "false" is truthy and writes under key "false"', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "false" });
		const event = save(agent, "kept-under-false");
		expect(event.actions.stateDelta?.false).toBe("kept-under-false");
	});

	it('outputKey "0" still writes (seventh control)', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "0" });
		const event = save(agent, "ok");
		expect(event.actions.stateDelta?.["0"]).toBe("ok");
	});

	it("empty-string outputKey still skips write (seventh control)", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "" });
		const event = save(agent, "secret");
		expect(event.actions.stateDelta).toEqual({});
	});
});
