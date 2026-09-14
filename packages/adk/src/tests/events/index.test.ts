import { describe, expect, it } from "vitest";
import * as events from "../../events";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer";
import type { EventsSummarizer } from "../../events/events-summarizer";

describe("events barrel exports", () => {
	it("exposes Event, EventActions, and compaction helpers", () => {
		expect(typeof events.Event).toBe("function");
		expect(typeof events.EventActions).toBe("function");
		expect(typeof events.LlmEventSummarizer).toBe("function");
		expect(typeof events.runCompactionForSlidingWindow).toBe("function");
		expect(typeof events.Event.newId).toBe("function");
	});

	it("constructs Event and EventActions from barrel", () => {
		const actions = new events.EventActions({
			stateDelta: { a: 1 },
			compaction: {
				startTimestamp: 1,
				endTimestamp: 2,
				compactedContent: { role: "model", parts: [{ text: "sum" }] },
			},
		});
		const event = new events.Event({
			author: "agent",
			actions,
			content: { role: "model", parts: [{ text: "hi" }] },
		});
		expect(event.actions?.stateDelta).toEqual({ a: 1 });
		expect(event.actions?.compaction?.endTimestamp).toBe(2);
		expect(event.content?.parts?.[0]?.text).toBe("hi");
	});

	it("EventsSummarizer interface is satisfied by LlmEventSummarizer", () => {
		const model = {
			generateContentAsync: async function* () {
				yield { content: { parts: [{ text: "ok" }] } };
			},
		};
		const summarizer: EventsSummarizer = new LlmEventSummarizer(model as any);
		expect(typeof summarizer.maybeSummarizeEvents).toBe("function");
	});

	it("re-exports keep Event identity stable with direct imports", () => {
		expect(events.Event).toBe(Event);
		expect(events.EventActions).toBe(EventActions);
		expect(events.LlmEventSummarizer).toBe(LlmEventSummarizer);
	});
});
