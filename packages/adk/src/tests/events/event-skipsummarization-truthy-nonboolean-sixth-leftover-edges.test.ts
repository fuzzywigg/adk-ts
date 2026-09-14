import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

/**
 * Sixth leftover: isFinalResponse short-circuits on truthy skipSummarization
 * (`if (this.actions.skipSummarization || this.longRunningToolIds)`), so
 * non-boolean truthy values force final even with a functionCall, while
 * falsy 0/"" do not.
 */
describe("event skipSummarization truthy non-boolean sixth leftover edges", () => {
	function withFunctionCall(skipSummarization: unknown): Event {
		return new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "t", args: {} } }],
			},
			actions: new EventActions({
				skipSummarization: skipSummarization as boolean,
			}),
		});
	}

	it.each([
		1,
		"yes",
		{},
		[],
	] as const)("truthy skipSummarization %j forces isFinalResponse with functionCall", (skip) => {
		expect(withFunctionCall(skip).isFinalResponse()).toBe(true);
	});

	it.each([
		0,
		"",
		false,
	] as const)("falsy skipSummarization %j does not short-circuit; functionCall stays non-final", (skip) => {
		expect(withFunctionCall(skip).isFinalResponse()).toBe(false);
	});

	it("omitted skipSummarization does not short-circuit (control)", () => {
		expect(withFunctionCall(undefined).isFinalResponse()).toBe(false);
	});
});
