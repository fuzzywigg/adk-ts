import { describe, expect, it } from "vitest";
import * as events from "../../events";

describe("events barrel exports", () => {
	it("exposes Event and EventActions constructors", () => {
		expect(typeof events.Event).toBe("function");
		expect(typeof events.EventActions).toBe("function");
		expect(typeof events.Event.newId).toBe("function");
	});

	it("exposes compaction entry points", () => {
		expect(typeof events.runCompactionForSlidingWindow).toBe("function");
		expect(typeof events.LlmEventSummarizer).toBe("function");
	});

	it("constructs an Event with EventActions compaction payload", () => {
		const event = new events.Event({
			invocationId: "inv",
			author: "user",
			actions: new events.EventActions({
				compaction: {
					startTimestamp: 1,
					endTimestamp: 2,
					compactedContent: {
						role: "model",
						parts: [{ text: "summary" }],
					},
				},
			}),
		});
		expect(event.actions.compaction?.endTimestamp).toBe(2);
		expect(event.actions.compaction?.compactedContent?.parts?.[0]?.text).toBe(
			"summary",
		);
	});
});
