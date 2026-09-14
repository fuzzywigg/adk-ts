import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twenty-first leftover: sixth pins boolean `true` sticky; seventh pins
 * `"0"`/`"false"`. Assert string `"true"` keeps via `|| false` and sticks
 * `_closed`; SameValueZero `-0` coalesces to `false` and does not stick —
 * true asymmetry residual after twentieth tip.
 */
describe("LiveRequestQueue close true/string-true/negzero twenty-first leftover", () => {
	it('LiveRequest preserves close="true" (truthy string trap)', () => {
		expect(new LiveRequest({ close: "true" as any }).close).toBe("true");
	});

	it('send with close="true" sticks _closed so next send throws', () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "true" as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "late" }] } })),
		).toThrow("Queue is closed");
	});

	it("boolean true close still sticks (sixth control)", () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: true }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it("SameValueZero -0 close coalesces to false and does not stick", () => {
		const req = new LiveRequest({ close: -0 as any });
		expect(req.close).toBe(false);
		const queue = new LiveRequestQueue();
		queue.send(req);
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});

	it('string "true" close request is still deliverable via get()', async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "true" as any }));
		const got = await queue.get();
		expect(got.close).toBe("true");
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it('string "false" still sticks (seventh control asymmetry)', () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "false" as any }));
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
