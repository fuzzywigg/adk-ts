import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmAgent } from "../../agents/llm-agent";
import { Event } from "../../events/event";

describe("LlmAgent outputKey / if(result) seventh leftover after author-case", () => {
	function save(agent: LlmAgent, text: string, author = "owner"): Event {
		const event = new Event({
			author,
			content: { parts: [{ text }] },
		});
		vi.spyOn(event, "isFinalResponse").mockReturnValue(true);
		agent["maybeSaveOutputToState"](event);
		return event;
	}

	it("empty-string outputKey is falsy so nothing is written", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "" });
		const event = save(agent, "secret");
		expect(event.actions.stateDelta).toEqual({});
	});

	it("outputKey 0 is truthy and writes under the string key 0", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "0" });
		const event = save(agent, "ok");
		expect(event.actions.stateDelta?.["0"]).toBe("ok");
	});

	it("whitespace-only result is truthy without schema and is stored", () => {
		const agent = new LlmAgent({ name: "owner", outputKey: "out" });
		const event = save(agent, "   ");
		expect(event.actions.stateDelta?.out).toBe("   ");
	});

	it("whitespace-only result with schema returns before parse via trim()", () => {
		const agent = new LlmAgent({
			name: "owner",
			outputKey: "out",
			outputSchema: z.object({ v: z.number() }),
		});
		const event = save(agent, "   ");
		expect(event.actions.stateDelta?.out).toBeUndefined();
	});

	it.each([
		{ label: "json 0", text: "0", schema: z.number(), stored: undefined },
		{
			label: "json false",
			text: "false",
			schema: z.boolean(),
			stored: undefined,
		},
		{
			label: "json empty string",
			text: '""',
			schema: z.string(),
			stored: undefined,
		},
		{ label: "json true", text: "true", schema: z.boolean(), stored: true },
	])("$label after schema.parse is gated by if(result)", ({
		text,
		schema,
		stored,
	}) => {
		const agent = new LlmAgent({
			name: "owner",
			outputKey: "out",
			outputSchema: schema,
		});
		const event = save(agent, text);
		expect(event.actions.stateDelta?.out).toBe(stored);
	});
});
