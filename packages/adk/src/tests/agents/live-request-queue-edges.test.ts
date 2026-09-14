import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

describe("LiveRequest leftover edges", () => {
	it("defaults close to false when omitted", () => {
		const request = new LiveRequest();
		expect(request.close).toBe(false);
	});

	it("defaults close to false when close is undefined", () => {
		const request = new LiveRequest({ close: undefined });
		expect(request.close).toBe(false);
	});

	it("accepts content without blob", () => {
		const content = { role: "user", parts: [{ text: "hello" }] };
		const request = new LiveRequest({ content });
		expect(request.content).toEqual(content);
		expect(request.blob).toBeUndefined();
		expect(request.close).toBe(false);
	});

	it("accepts blob without content", () => {
		const blob = { data: "YQ==", mimeType: "audio/pcm" };
		const request = new LiveRequest({ blob });
		expect(request.blob).toEqual(blob);
		expect(request.content).toBeUndefined();
		expect(request.close).toBe(false);
	});

	it("accepts explicit close true", () => {
		const request = new LiveRequest({ close: true });
		expect(request.close).toBe(true);
		expect(request.content).toBeUndefined();
		expect(request.blob).toBeUndefined();
	});
});

describe("LiveRequestQueue leftover edges", () => {
	it("throws Queue is closed after close()", async () => {
		const queue = new LiveRequestQueue();
		queue.close();
		await queue.get();

		expect(() =>
			queue.sendContent({ role: "user", parts: [{ text: "late" }] }),
		).toThrow("Queue is closed");
		expect(() =>
			queue.sendRealtime({ data: "YQ==", mimeType: "text/plain" }),
		).toThrow("Queue is closed");
		expect(() =>
			queue.send(new LiveRequest({ content: { parts: [] } })),
		).toThrow("Queue is closed");
	});

	it("throws Queue is closed after send with close true", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: true }));
		await queue.get();

		expect(() => queue.sendContent({ role: "user", parts: [] })).toThrow(
			"Queue is closed",
		);
	});

	it("delivers close request to a waiting getter", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();
		queue.close();
		const request = await pending;
		expect(request.close).toBe(true);
	});

	it("buffers content-only requests before get", async () => {
		const queue = new LiveRequestQueue();
		const content = { role: "user", parts: [{ text: "buffered" }] };
		queue.sendContent(content);
		const request = await queue.get();
		expect(request.content).toEqual(content);
		expect(request.blob).toBeUndefined();
		expect(request.close).toBe(false);
	});

	it("buffers blob-only requests before get", async () => {
		const queue = new LiveRequestQueue();
		const blob = { data: "AQID", mimeType: "application/octet-stream" };
		queue.sendRealtime(blob);
		const request = await queue.get();
		expect(request.blob).toEqual(blob);
		expect(request.content).toBeUndefined();
	});

	it("allows sends with neither content nor blob before close", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest());
		const request = await queue.get();
		expect(request.content).toBeUndefined();
		expect(request.blob).toBeUndefined();
		expect(request.close).toBe(false);
	});

	it("processes mixed content and blob requests in FIFO order", async () => {
		const queue = new LiveRequestQueue();
		const content = { role: "user", parts: [{ text: "first" }] };
		const blob = { data: "YQ==", mimeType: "text/plain" };

		queue.sendContent(content);
		queue.sendRealtime(blob);
		queue.send(new LiveRequest({ close: true }));

		const first = await queue.get();
		const second = await queue.get();
		const third = await queue.get();

		expect(first.content).toEqual(content);
		expect(second.blob).toEqual(blob);
		expect(third.close).toBe(true);
	});
});
