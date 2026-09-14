import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

/**
 * Sixth leftover: maybeSaveOutputToState uses event.author !== this.name
 * (case-sensitive). Near-miss authors skip state writes.
 */
describe("LlmAgent output author case sixth leftover", () => {
	it.each([
		"Owner",
		"OWNER",
		"owner ",
		" owner",
	])("author %j !== agent name skips save", (author) => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const debug = vi.fn();
		(agent as any).logger = { debug, error: vi.fn(), warn: vi.fn() };
		const event = new Event({
			author,
			content: { parts: [{ text: "secret" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBeUndefined();
		expect(debug).toHaveBeenCalled();
	});

	it("exact matching author saves outputKey", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const event = new Event({
			author: "owner",
			content: { parts: [{ text: "ok" }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		expect(event.actions.stateDelta?.out).toBe("ok");
	});
});
