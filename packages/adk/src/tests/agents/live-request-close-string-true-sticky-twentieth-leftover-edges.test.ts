import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Twentieth leftover: seventh pins close `"0"`/`"false"` sticky. Residual
 * `"true"` kept via `close || false` and sticks `_closed` on send.
 */
describe("LiveRequestQueue close string-true sticky twentieth leftover", () => {
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

	it('string "true" close request is still deliverable via get()', async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "true" as any }));
		const got = await queue.get();
		expect(got.close).toBe("true");
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it('string "false" close still sticks (seventh control)', () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "false" as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "late" }] } })),
		).toThrow("Queue is closed");
	});

	it("boolean false close does not stick (fifth control)", () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: false }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});
});
