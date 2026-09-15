import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-first leftover residual deepen (complements #251 true/negzero):
 * `close || false` — POSITIVE_INFINITY / `1` / `{}` / `Object(true)` /
 * `"Infinity"` kept and stick `_closed`; `NaN` coalesces to `false`.
 */
describe("LiveRequestQueue close posinf/nan/object-true twenty-first residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: '"Infinity"', value: "Infinity" },
	])("close $label is preserved and sticks _closed", ({ value }) => {
		expect(new LiveRequest({ close: value as any }).close).toBe(value);
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

	it("NEGATIVE_INFINITY close is truthy and sticks (asymmetry vs NaN)", () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: Number.NEGATIVE_INFINITY as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
