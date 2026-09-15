import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-first leftover residual deepen (complements #251 true/negzero close):
 * `close || false` — POSITIVE_INFINITY / `1` / `{}` / `Object(true)` keep and
 * stick `_closed`; `NaN` collapses to `false` and does not stick (distinct
 * from SameValueZero `-0` label in twenty-first).
 */
describe("LiveRequestQueue close posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("LiveRequest preserves close=$label via || false", ({ value }) => {
		expect(new LiveRequest({ close: value as any }).close).toBe(value);
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("send with close=$label sticks _closed", ({ value }) => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: value as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it("NaN close coalesces to false and does not stick", () => {
		const req = new LiveRequest({ close: Number.NaN as any });
		expect(req.close).toBe(false);
		const queue = new LiveRequestQueue();
		queue.send(req);
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});

	it("NEGATIVE_INFINITY close is truthy and sticks (sibling of posinf)", () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: Number.NEGATIVE_INFINITY as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
