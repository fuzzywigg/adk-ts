import { describe, expect, it } from "vitest";
import { Event } from "../events/event";
import { _findFunctionCallEventIfLastEventIsFunctionResponse } from "../runners";
import type { Session } from "../sessions/session";

function mockSession(events: Event[]): Session {
	return { id: "s", userId: "u", events } as Session;
}

/**
 * Nineteenth leftover (runners residual): `if (!functionCallId)` —
 * string `"0"`/`"false"` are truthy and match via ===.
 * Eleventh covered empty/null/0/false as null returns.
 */
describe("runners functionResponse id string-zero/false nineteenth leftover", () => {
	it.each([
		{ label: "string-zero", id: "0" },
		{ label: "string-false", id: "false" },
	])("matches call when functionResponse.id is truthy $label", ({ id }) => {
		const call = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id, name: "lookup", args: {} } }],
			},
		});
		const response = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id,
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
		).toBe(call);
	});

	it("numeric 0 still returns null (control vs string zero)", () => {
		const call = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: 0 as any, name: "lookup", args: {} } }],
			},
		});
		const response = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id: 0 as any,
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
