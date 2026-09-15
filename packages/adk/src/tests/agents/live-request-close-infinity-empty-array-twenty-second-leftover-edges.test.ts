import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins close `"true"` / true / `-0`. Assert ±Infinity / `[]`
 * sticky via `|| false` and `if (req.close)`; deepen true-asymmetry
 * sentinels on LiveRequest close.
 */
describe("LiveRequestQueue close infinity/empty-array twenty-second leftover", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
		{ label: "empty-array", value: [] as never[] },
	])("close $label is preserved and sticks _closed", ({ value, label }) => {
		const req = new LiveRequest({ close: value as any });
		expect(req.close).toBe(value as any);
		const queue = new LiveRequestQueue();
		queue.send(req);
		expect(() =>
			queue.send(
				new LiveRequest({
					content: { parts: [{ text: `late-${label}` }] },
				}),
			),
		).toThrow("Queue is closed");
	});

	it("POSITIVE_INFINITY close request is still deliverable via get()", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: Number.POSITIVE_INFINITY as any }));
		const got = await queue.get();
		expect(got.close).toBe(Number.POSITIVE_INFINITY);
	});

	it('string "true" still sticks (twenty-first control)', () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "true" as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it("SameValueZero -0 still coalesces to false (twenty-first control)", () => {
		const req = new LiveRequest({ close: -0 as any });
		expect(req.close).toBe(false);
		const queue = new LiveRequestQueue();
		queue.send(req);
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});
});
