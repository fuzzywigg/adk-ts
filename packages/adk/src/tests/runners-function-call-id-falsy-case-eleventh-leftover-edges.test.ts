import { describe, expect, it } from "vitest";
import { Event } from "../events/event";
import { _findFunctionCallEventIfLastEventIsFunctionResponse } from "../runners";
import type { Session } from "../sessions/session";

function sessionWith(events: Event[]): Session {
	return {
		id: "s-fc-11",
		userId: "u1",
		appName: "app",
		state: {},
		events,
		lastUpdateTime: 0,
	} as Session;
}

function callEvent(id: string, author = "tool_agent"): Event {
	return new Event({
		author,
		content: {
			role: "model",
			parts: [{ functionCall: { id, name: "lookup", args: {} } }],
		},
	});
}

function responseEvent(id: any, author = "user"): Event {
	return new Event({
		author,
		content: {
			parts: [
				{
					functionResponse: {
						id,
						name: "lookup",
						response: { ok: true },
					},
				},
			],
		},
	});
}

/**
 * Eleventh leftover: `if (!functionCallId) return null` is truthiness (empty
 * string/0/false abort). Matching uses `===` so Call_1 ≠ call_1.
 */
describe("runners functionCallId falsy + case eleventh leftover", () => {
	it.each([
		{ label: "empty string", id: "" },
		{ label: "0", id: 0 },
		{ label: "false", id: false },
		{ label: "null", id: null },
	])("returns null when functionResponse.id is $label via !functionCallId", ({
		id,
	}) => {
		const call = callEvent("call_1");
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWith([call, responseEvent(id)]),
			),
		).toBeNull();
	});

	it("whitespace id is truthy and matches only the exact same id", () => {
		const call = callEvent(" ");
		const other = callEvent("call_1");
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWith([other, call, responseEvent(" ")]),
			),
		).toBe(call);
	});

	it.each([
		{ callId: "call_1", responseId: "Call_1" },
		{ callId: "call_1", responseId: "CALL_1" },
		{ callId: "call_1", responseId: "call_1 " },
		{ callId: "call_1", responseId: " call_1" },
	])("id === is case/padding sensitive ($callId vs $responseId)", ({
		callId,
		responseId,
	}) => {
		const call = callEvent(callId);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWith([call, responseEvent(responseId)]),
			),
		).toBeNull();
	});

	it("exact id still matches (control)", () => {
		const call = callEvent("call_1");
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWith([call, responseEvent("call_1")]),
			),
		).toBe(call);
	});
});
