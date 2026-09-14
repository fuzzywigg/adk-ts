import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

/**
 * Sixth leftover: send() uses if (req.close) to stick _closed.
 * Fifth leftover proved LiveRequest preserves truthy non-booleans via ||;
 * queue sticky close with those values was not a leftover matrix.
 */
describe("LiveRequestQueue truthy close sticky sixth leftover", () => {
	it.each([
		{ label: "1", value: 1 },
		{ label: '"yes"', value: "yes" },
		{ label: "object", value: {} },
		{ label: "true", value: true },
	])("send with close=$label sticks _closed so next send throws", ({
		value,
	}) => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: value as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "late" }] } })),
		).toThrow("Queue is closed");
	});

	it.each([
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
	])("send with falsy close=$label does not stick _closed", ({ value }) => {
		const queue = new LiveRequestQueue();
		// LiveRequest coalesces falsy close → false; send must not close.
		queue.send(new LiveRequest({ close: value as any }));
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [{ text: "ok" }] } })),
		).not.toThrow();
	});

	it("truthy close request is still deliverable via get() before throw on next send", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: "yes" as any }));
		const got = await queue.get();
		expect(got.close).toBe("yes");
		expect(() => queue.send(new LiveRequest())).toThrow("Queue is closed");
	});
});
