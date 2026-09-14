import { describe, expect, it } from "vitest";
import { Event } from "../events/event";
import { _findFunctionCallEventIfLastEventIsFunctionResponse } from "../runners";
import type { Session } from "../sessions/session";

function mockSession(events: Event[]): Session {
	return { id: "s", userId: "u", events } as Session;
}

/**
 * Eleventh leftover: if (!functionCallId) return null —
 * missing id is covered; empty-string / other falsy ids are residual.
 */
describe("runners functionResponse empty-id eleventh leftover", () => {
	it.each([
		{ label: "empty string", id: "" },
		{ label: "null", id: null },
		{ label: "0", id: 0 },
		{ label: "false", id: false },
		{ label: "undefined", id: undefined },
	])("returns null when functionResponse.id is $label", ({ id }) => {
		const call = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "c1", name: "lookup", args: {} } }],
			},
		});
		const response = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id: id as any,
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

	it("whitespace-only id is truthy and can match a call with the same id", () => {
		const call = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "   ", name: "lookup", args: {} } }],
			},
		});
		const response = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id: "   ",
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

	it("truthy id matches corresponding functionCall", () => {
		const call = new Event({
			author: "tool_agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "c-ok", name: "lookup", args: {} } }],
			},
		});
		const response = new Event({
			author: "user",
			content: {
				parts: [
					{
						functionResponse: {
							id: "c-ok",
							name: "lookup",
							response: { ok: true },
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
});
