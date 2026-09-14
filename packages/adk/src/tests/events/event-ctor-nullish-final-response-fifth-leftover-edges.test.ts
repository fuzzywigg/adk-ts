import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";

describe("Event ctor ?? / isFinalResponse falsy fifth leftover (post #165)", () => {
	it.each([
		{ label: "undefined", invocationId: undefined, expected: "" },
		{ label: "null", invocationId: null, expected: "" },
		{ label: '""', invocationId: "", expected: "" },
		{ label: "explicit", invocationId: "inv-x", expected: "inv-x" },
	] as const)('invocationId ?? "": $label', ({ invocationId, expected }) => {
		const event = new Event({
			author: "a",
			invocationId: invocationId as any,
		});
		expect(event.invocationId).toBe(expected);
	});

	it("id ?? Event.newId() generates when id nullish; keeps empty string", () => {
		const withGenerated = new Event({ author: "a", id: undefined });
		expect(withGenerated.id.length).toBeGreaterThan(0);

		const withNull = new Event({ author: "a", id: null as any });
		expect(withNull.id.length).toBeGreaterThan(0);

		const withEmpty = new Event({ author: "a", id: "" });
		expect(withEmpty.id).toBe("");
	});

	it("timestamp ?? now: keeps explicit 0 via ?? (asymmetry vs ||)", () => {
		const event = new Event({ author: "a", timestamp: 0 });
		expect(event.timestamp).toBe(0);

		const nullish = new Event({ author: "a", timestamp: null as any });
		expect(nullish.timestamp).toBeGreaterThan(0);
	});

	it("actions ?? new EventActions() when actions nullish", () => {
		const event = new Event({ author: "a", actions: null as any });
		expect(event.actions).toBeInstanceOf(EventActions);
	});

	it("empty Set longRunningToolIds is truthy so isFinalResponse even with functionCall", () => {
		const event = new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "t", args: {} } }],
			},
			longRunningToolIds: new Set(),
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it("undefined longRunningToolIds does not short-circuit; functionCall makes non-final", () => {
		const event = new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "t", args: {} } }],
			},
		});
		expect(event.isFinalResponse()).toBe(false);
	});

	it("skipSummarization true forces isFinalResponse even with functionCall", () => {
		const event = new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "t", args: {} } }],
			},
			actions: new EventActions({ skipSummarization: true }),
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it.each([
		{ label: "null", codeExecutionResult: null, expected: false },
		{ label: "undefined", codeExecutionResult: undefined, expected: false },
		{
			label: "object",
			codeExecutionResult: { outcome: "OK", output: "x" },
			expected: true,
		},
		{
			label: "0 truthy? no — 0 != null is true",
			codeExecutionResult: 0,
			expected: true,
		},
		{ label: '"" != null', codeExecutionResult: "", expected: true },
	] as const)("hasTrailingCodeExecutionResult != null: $label", ({
		codeExecutionResult,
		expected,
	}) => {
		const event = new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ codeExecutionResult: codeExecutionResult as any }],
			},
		});
		expect(event.hasTrailingCodeExecutionResult()).toBe(expected);
	});
});
