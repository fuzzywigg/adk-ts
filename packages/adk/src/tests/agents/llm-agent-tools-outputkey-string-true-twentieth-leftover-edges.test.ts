import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Twentieth leftover: eighteenth pins tools/outputKey `"false"`. Residual
 * string-truthy `"true"` keep via `tools || []` and outputKey write under
 * key `"true"`.
 */
describe("LlmAgent tools/outputKey string-true twentieth leftover", () => {
	function save(agent: LlmAgent, text: string): Event {
		const event = new Event({
			author: agent.name,
			content: { parts: [{ text }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it('tools "true" is kept via || (not coalesced to [])', () => {
		const agent = new LlmAgent({
			name: "tools_str_true",
			tools: "true" as any,
		});
		expect(agent.tools).toBe("true");
		expect(Array.isArray(agent.tools)).toBe(false);
	});

	it("tools boolean true is kept via || (truthy non-array)", () => {
		const agent = new LlmAgent({
			name: "tools_bool_true",
			tools: true as any,
		});
		expect(agent.tools).toBe(true);
		expect(Array.isArray(agent.tools)).toBe(false);
	});

	it("tools numeric 0 still coalesces to [] (eighth control)", () => {
		const agent = new LlmAgent({ name: "tools_num", tools: 0 as any });
		expect(agent.tools).toEqual([]);
	});

	it('outputKey "true" is truthy and writes under key "true"', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "true" });
		const event = save(agent, "kept-under-true");
		expect(event.actions.stateDelta?.true).toBe("kept-under-true");
	});

	it('outputKey "false" still writes (eighteenth control)', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "false" });
		const event = save(agent, "kept-under-false");
		expect(event.actions.stateDelta?.false).toBe("kept-under-false");
	});
});
