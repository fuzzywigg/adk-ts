import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Eighth leftover: maybeSaveOutputToState maps `part.text || ""`.
 * AgentBuilder ask seventh leftover pins 0/false on the ask path;
 * LlmAgent save path still lacked that matrix.
 */
describe("LlmAgent part.text 0/false save eighth leftover", () => {
	function save(agent: LlmAgent, parts: Array<Record<string, unknown>>): Event {
		const event = new Event({
			author: agent.name,
			content: { parts: parts as any },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it('numeric text 0 coalesces via || "" and drops from joined result', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const event = save(agent, [{ text: 0 }, { text: "kept" }]);
		expect(event.actions.stateDelta?.out).toBe("kept");
	});

	it('boolean text false coalesces via || "" and drops from joined result', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const event = save(agent, [{ text: false }, { text: "kept" }]);
		expect(event.actions.stateDelta?.out).toBe("kept");
	});

	it('string text "0" is truthy and is stored', () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const event = save(agent, [{ text: "0" }]);
		expect(event.actions.stateDelta?.out).toBe("0");
	});

	it("all-zero/false parts yield empty join so if(result) skips write", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const event = save(agent, [{ text: 0 }, { text: false }, { text: "" }]);
		expect(event.actions.stateDelta?.out).toBeUndefined();
	});
});
