import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * `close || false` — string `"Infinity"` / `Object(1)` / `Object(false)` keep and
 * stick `_closed` (boxed false is truthy; distinct from bare `false` / `-0`).
 */
describe("LiveRequestQueue close string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("LiveRequest preserves close=$label via || false", ({ value }) => {
		expect(new LiveRequest({ close: value as any }).close).toBe(value);
	});

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("send with close=$label sticks _closed", ({ value }) => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: value as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
