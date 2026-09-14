import { describe, expect, it } from "vitest";
import { Event } from "../../../events/event";
import { EventActions } from "../../../events/event-actions";
import { mergeParallelFunctionResponseEvents } from "../../../flows/llm-flows/functions";

function frEvent(
	name: string,
	id: string,
	response: unknown,
	opts: { skipParts?: boolean; skipContent?: boolean } = {},
): Event {
	if (opts.skipContent) {
		return new Event({
			author: "agent",
			actions: new EventActions({
				stateDelta: { [`from_${name}`]: true },
			}),
		});
	}
	if (opts.skipParts) {
		return new Event({
			author: "agent",
			content: { role: "user" } as any,
			actions: new EventActions({
				stateDelta: { [`from_${name}`]: true },
			}),
		});
	}
	return new Event({
		author: "agent",
		content: {
			role: "user",
			parts: [
				{
					functionResponse: { name, id, response },
				},
			],
		},
		actions: new EventActions({
			stateDelta: { [`from_${name}`]: true },
		}),
	});
}

describe("functions sixth leftover: merge missing parts (post #151)", () => {
	it("skips mid-list events missing content.parts while merging others", () => {
		const a = frEvent("a", "1", { a: 1 });
		const missing = frEvent("missing", "x", {}, { skipParts: true });
		const b = frEvent("b", "2", { b: 2 });

		const merged = mergeParallelFunctionResponseEvents([a, missing, b]);

		expect(merged.getFunctionResponses()).toHaveLength(2);
		expect(merged.getFunctionResponses().map((r) => r.name)).toEqual([
			"a",
			"b",
		]);
		// Object.assign on actions replaces stateDelta with the last event's delta
		expect(merged.actions.stateDelta).toEqual({ from_b: true });
	});

	it("skips events with no content at all while merging siblings", () => {
		const a = frEvent("a", "1", { a: 1 });
		const noContent = frEvent("ghost", "g", {}, { skipContent: true });
		const b = frEvent("b", "2", { b: 2 });

		const merged = mergeParallelFunctionResponseEvents([a, noContent, b]);

		expect(merged.getFunctionResponses()).toHaveLength(2);
		expect(merged.content?.parts).toHaveLength(2);
		expect(merged.actions.stateDelta).toEqual({ from_b: true });
	});

	it("all events missing parts yields merged event with empty parts", () => {
		const a = frEvent("a", "1", {}, { skipParts: true });
		const b = frEvent("b", "2", {}, { skipContent: true });

		const merged = mergeParallelFunctionResponseEvents([a, b]);

		expect(merged.content?.parts).toEqual([]);
		expect(merged.getFunctionResponses()).toHaveLength(0);
		expect(merged.actions.stateDelta).toEqual({ from_b: true });
	});

	it("uses first event as base even when first has no parts", () => {
		const first = new Event({
			author: "base-author",
			branch: "branch-a",
			content: { role: "user" } as any,
		});
		const second = frEvent("second", "2", { ok: true });

		const merged = mergeParallelFunctionResponseEvents([first, second]);

		expect(merged.author).toBe("base-author");
		expect(merged.branch).toBe("branch-a");
		expect(merged.getFunctionResponses()).toHaveLength(1);
		expect(merged.getFunctionResponses()[0].name).toBe("second");
	});

	it("nullish content.parts on middle event does not throw", () => {
		const a = frEvent("a", "1", { a: 1 });
		const nullParts = new Event({
			author: "agent",
			content: { role: "user", parts: null as any },
		});
		const b = frEvent("b", "2", { b: 2 });

		const merged = mergeParallelFunctionResponseEvents([a, nullParts, b]);
		expect(merged.getFunctionResponses().map((r) => r.name)).toEqual([
			"a",
			"b",
		]);
	});
});
