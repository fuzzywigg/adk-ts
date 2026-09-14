import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Eighth leftover: LiveRequest `close || false` keeps truthy string "0",
 * and send() `if (req.close)` sticks _closed. Sixth leftover pinned "yes";
 * string "0" was not in that matrix.
 */
describe("LiveRequestQueue close string 0 sticky eighth leftover", () => {
	it('LiveRequest preserves close "0" (truthy, not coalesced to false)', () => {
		expect(new LiveRequest({ close: "0" as any }).close).toBe("0");
	});

	it('send with close "0" sticks _closed so next send throws', () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "0" as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "late" }] } })),
		).toThrow("Queue is closed");
	});

	it('close "0" request is still deliverable via get()', async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "0" as any }));
		const got = await queue.get();
		expect(got.close).toBe("0");
	});
});
