import { describe, expect, it } from "vitest";
import { Event } from "../events/event";
import { _findFunctionCallEventIfLastEventIsFunctionResponse } from "../runners";
import type { Session } from "../sessions/session";

function sessionWith(events: Event[]): Session {
	return {
		id: "s-fc-15",
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

function responseEvent(id: unknown, author = "user"): Event {
	return new Event({
		author,
		content: {
			parts: [
				{
					functionResponse: {
						id: id as string,
						name: "lookup",
						response: { ok: true },
					},
				},
			],
		},
	});
}

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #269 / 03ff90a8 after providers; supersedes closed #273/#262): eleventh leftover pins classic falsy
 * `!functionCallId` abort. String `"0"` / `"false"` are truthy so matching
 * proceeds and `===` keeps the call event.
 */
describe("runners functionCallId string-zero/false match fifteenth leftover", () => {
	it.each([
		{ label: '"0"', id: "0" },
		{ label: '"false"', id: "false" },
	])("truthy response id $label matches the call event", ({ id }) => {
		const call = callEvent(id);
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWith([call, responseEvent(id)]),
			),
		).toBe(call);
	});

	it("numeric 0 still aborts via !functionCallId (eleventh control)", () => {
		const call = callEvent("0");
		expect(
			_findFunctionCallEventIfLastEventIsFunctionResponse(
				sessionWith([call, responseEvent(0)]),
			),
		).toBeNull();
	});
});
