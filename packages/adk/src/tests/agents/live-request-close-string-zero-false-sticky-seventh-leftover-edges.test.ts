import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Seventh leftover: string `"0"` / `"false"` look falsy but are truthy, so
 * `close || false` keeps them and `if (req.close)` sticks the queue closed.
 * Fifth coalesces real falsy; sixth sticky matrix used `1`/`"yes"`/`{}`/`true`.
 */
describe("LiveRequestQueue close string-zero/false sticky seventh leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("LiveRequest preserves close=$label (truthy string trap)", ({ value }) => {
		expect(new LiveRequest({ close: value as any }).close).toBe(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("send with close=$label sticks _closed so next send throws", ({
		value,
	}) => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: value as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "late" }] } })),
		).toThrow("Queue is closed");
	});

	it('string "0" close request is still deliverable via get()', async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "0" as any }));
		const got = await queue.get();
		expect(got.close).toBe("0");
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "false", value: false },
	])("real falsy close=$label does not stick (fifth/sixth control)", ({
		value,
	}) => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: value as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});
});
