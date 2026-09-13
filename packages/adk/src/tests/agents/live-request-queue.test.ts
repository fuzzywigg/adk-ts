import { describe, expect, it } from "vitest";
import { LiveRequest, LiveRequestQueue } from "../../agents/live-request-queue";

describe("LiveRequest", () => {
	it("defaults close to false and accepts content/blob", () => {
		const content = { role: "user", parts: [{ text: "hi" }] };
		const request = new LiveRequest({ content });

		expect(request.content).toEqual(content);
		expect(request.close).toBe(false);
		expect(request.blob).toBeUndefined();
	});
});

describe("LiveRequestQueue", () => {
	it("queues content and realtime blobs FIFO", async () => {
		const queue = new LiveRequestQueue();
		const content = { role: "user", parts: [{ text: "one" }] };
		const blob = { data: "YQ==", mimeType: "text/plain" };

		queue.sendContent(content);
		queue.sendRealtime(blob);

		const first = await queue.get();
		const second = await queue.get();

		expect(first.content).toEqual(content);
		expect(second.blob).toEqual(blob);
	});

	it("resolves waiters when a request arrives after get", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();

		queue.send(new LiveRequest({ content: { role: "user", parts: [] } }));

		const request = await pending;
		expect(request.content?.role).toBe("user");
	});

	it("closes the queue and rejects later sends", async () => {
		const queue = new LiveRequestQueue();
		queue.close();

		const closeRequest = await queue.get();
		expect(closeRequest.close).toBe(true);
		expect(() => queue.sendContent({ role: "user", parts: [] })).toThrow(
			"Queue is closed",
		);
		expect(() =>
			queue.sendRealtime({ data: "YQ==", mimeType: "text/plain" }),
		).toThrow("Queue is closed");
		expect(() =>
			queue.send(new LiveRequest({ content: { role: "user", parts: [] } })),
		).toThrow("Queue is closed");
	});

	it("resolves a pending waiter immediately when close is called", async () => {
		const queue = new LiveRequestQueue();
		const pending = queue.get();

		queue.close();

		const request = await pending;
		expect(request.close).toBe(true);
		expect(() => queue.sendContent({ role: "user", parts: [] })).toThrow(
			"Queue is closed",
		);
	});

	it("marks closed when a LiveRequest with close true is sent", async () => {
		const queue = new LiveRequestQueue();
		queue.send(new LiveRequest({ close: true }));

		const request = await queue.get();
		expect(request.close).toBe(true);
		expect(() => queue.sendContent({ role: "user", parts: [] })).toThrow(
			"Queue is closed",
		);
	});

	it("resolves multiple outstanding get waiters FIFO", async () => {
		const queue = new LiveRequestQueue();
		const first = queue.get();
		const second = queue.get();

		queue.sendContent({ role: "user", parts: [{ text: "a" }] });
		queue.sendContent({ role: "user", parts: [{ text: "b" }] });

		await expect(first).resolves.toMatchObject({
			content: { parts: [{ text: "a" }] },
		});
		await expect(second).resolves.toMatchObject({
			content: { parts: [{ text: "b" }] },
		});
	});
});
