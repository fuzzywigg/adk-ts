import { describe, expect, it } from "vitest";
import { Event } from "../events/event";
import { _findFunctionCallEventIfLastEventIsFunctionResponse } from "../runners";
import type { Session } from "../sessions/session";

function mockSession(events: Event[]): Session {
	return { id: "s", userId: "u", events } as Session;
}

/**
 * Nineteenth leftover (runners residual): `event.getFunctionCalls?.() || []`
 * when method returns falsy primitives — coalesce to empty, no match.
 */
describe("runners getFunctionCalls or-empty falsy nineteenth leftover", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty-string", value: "" },
	])("returns null when getFunctionCalls returns falsy $label", ({ value }) => {
		const call = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "c1", name: "lookup", args: {} } }],
			},
		});
		(call as any).getFunctionCalls = () => value;

		const response = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id: "c1",
							name: "lookup",
							response: {},
						},
					},
				],
			},
		});

		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				mockSession([call, response]),
			),
		).toBeNull();
	});
});
