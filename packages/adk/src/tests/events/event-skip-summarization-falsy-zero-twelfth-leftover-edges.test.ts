import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event.isFinalResponse skipSummarization || falsy twelfth leftover", () => {
	function eventWithSkip(skip: unknown): Event {
		return new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "t", args: {} } }],
			},
			actions: new EventActions({ skipSummarization: skip as any }),
		});
	}

	it.each([
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
		{ label: "false", value: false },
	])("skipSummarization=$label is falsy so functionCall stays non-final", ({
		value,
	}) => {
		expect(eventWithSkip(value).isFinalResponse()).toBe(false);
	});

	it.each([
		{ label: "true", value: true },
		{ label: "1", value: 1 },
		{ label: "nonempty string", value: "yes" },
	])("skipSummarization=$label is truthy so isFinalResponse even with functionCall", ({
		value,
	}) => {
		expect(eventWithSkip(value).isFinalResponse()).toBe(true);
	});
});
