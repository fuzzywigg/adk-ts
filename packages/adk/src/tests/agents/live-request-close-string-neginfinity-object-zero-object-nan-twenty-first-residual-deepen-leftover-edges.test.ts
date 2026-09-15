import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `close || false` — string `"-Infinity"` / `Object(0)` / `Object(NaN)` keep and
 * stick `_closed` (boxed NaN is truthy; distinct from bare `NaN` coalesce).
 */
describe("LiveRequestQueue close string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("LiveRequest preserves close=$label via || false", ({ value }) => {
		expect(new LiveRequest({ close: value as any }).close).toBe(value);
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("send with close=$label sticks _closed", ({ value }) => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: value as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
