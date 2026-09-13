import { describe, expect, it, vi } from "vitest";
import { MessagingController } from "../../../http/messaging/messaging.controller";

describe("MessagingController", () => {
	it("decodes agent id and returns message history", async () => {
		const messaging = {
			getMessages: vi.fn(async () => ({
				messages: [{ role: "user", content: "hi" }],
			})),
			postMessage: vi.fn(),
		};
		const controller = new MessagingController(messaging as never);

		await expect(
			controller.getAgentMessages(encodeURIComponent("/agents/demo")),
		).resolves.toEqual({
			messages: [{ role: "user", content: "hi" }],
		});
		expect(messaging.getMessages).toHaveBeenCalledWith("/agents/demo");
	});

	it("forwards postMessage body unchanged after decoding id", async () => {
		const body = {
			message: "Hello",
			attachments: [
				{ name: "a.txt", mimeType: "text/plain", data: "ZGF0YQ==" },
			],
		};
		const messaging = {
			getMessages: vi.fn(),
			postMessage: vi.fn(async () => ({
				response: "ok",
				sessionId: "s1",
			})),
		};
		const controller = new MessagingController(messaging as never);

		await expect(
			controller.postAgentMessage(encodeURIComponent("/agents/x"), body),
		).resolves.toEqual({ response: "ok", sessionId: "s1" });
		expect(messaging.postMessage).toHaveBeenCalledWith("/agents/x", body);
	});
});
