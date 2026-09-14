import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";

/**
 * Nineteenth leftover (events residual): `!this.partial` and
 * `if (part.functionCall)` empty-object truthy.
 */
describe("event partial/functionCall truthiness nineteenth leftover", () => {
	it.each([
		{ label: "0", partial: 0 },
		{ label: "empty-string", partial: "" },
		{ label: "false", partial: false },
	])("falsy partial $label still counts as final response", ({ partial }) => {
		const event = new Event({
			author: "a",
			partial: partial as any,
			content: { role: "model", parts: [{ text: "done" }] },
		});
		expect(event.isFinalResponse()).toBe(true);
	});

	it.each([
		{ label: "string-zero", partial: "0" },
		{ label: "empty-array", partial: [] },
		{ label: "empty-object", partial: {} },
	])("truthy partial $label is non-final", ({ partial }) => {
		const event = new Event({
			author: "a",
			partial: partial as any,
			content: { role: "model", parts: [{ text: "stream" }] },
		});
		expect(event.isFinalResponse()).toBe(false);
	});

	it("empty functionCall {} is truthy → counted → non-final", () => {
		const event = new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: {} as any }],
			},
		});
		expect(event.getFunctionCalls()).toHaveLength(1);
		expect(event.isFinalResponse()).toBe(false);
	});

	it("functionCall:0 is falsy and ignored", () => {
		const event = new Event({
			author: "a",
			content: {
				role: "model",
				parts: [{ functionCall: 0 as any, text: "ok" }],
			},
		});
		expect(event.getFunctionCalls()).toHaveLength(0);
		expect(event.isFinalResponse()).toBe(true);
	});
});
