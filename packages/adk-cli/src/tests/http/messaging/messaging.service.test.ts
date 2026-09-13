import { describe, expect, it, vi } from "vitest";
import { MessagingService } from "../../../http/messaging/messaging.service";
import type { LoadedAgent } from "../../../common/types";

describe("MessagingService", () => {
	it("returns empty messages when the agent cannot load", async () => {
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(null),
			getSessionMessages: vi.fn(),
			getSessionEvents: vi.fn(),
		};
		const agentManager = { sendMessageToAgent: vi.fn() };
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
		);

		await expect(service.getMessages("demo")).resolves.toEqual({
			messages: [],
		});
		expect(sessionsService.getSessionMessages).not.toHaveBeenCalled();
	});

	it("posts a message, broadcasts state, and picks agentName from final event", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "fallback" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionMessages: vi
				.fn()
				.mockResolvedValue([
					{ id: 1, type: "user", content: "hi", timestamp: "" },
				]),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: [
					{ author: "user", isFinalResponse: false },
					{ author: "worker", isFinalResponse: true },
				],
				totalCount: 2,
			}),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("pong"),
		};
		const hotReload = { broadcastState: vi.fn() };
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
			hotReload as never,
		);

		await expect(service.getMessages("demo")).resolves.toEqual({
			messages: [{ id: 1, type: "user", content: "hi", timestamp: "" }],
		});

		const response = await service.postMessage("demo", {
			message: "hello",
			attachments: [],
		});
		expect(agentManager.sendMessageToAgent).toHaveBeenCalledWith(
			"demo",
			"hello",
			[],
		);
		expect(hotReload.broadcastState).toHaveBeenCalledWith("demo", "s1");
		expect(response).toEqual({ response: "pong", agentName: "worker" });
	});

	it("falls back to loaded agent name when no assistant events exist", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "solo" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: [{ author: "user", isFinalResponse: true }],
				totalCount: 1,
			}),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("ok"),
		};
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
		);

		const response = await service.postMessage("demo", {
			message: "hi",
		} as any);
		expect(response.agentName).toBe("solo");
	});

	it("ignores broadcast failures and falls back when events lookup throws", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "fallback-agent" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockRejectedValue(new Error("events down")),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("ok"),
		};
		const hotReload = {
			broadcastState: vi.fn(() => {
				throw new Error("broadcast failed");
			}),
		};
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
			hotReload as never,
		);

		await expect(
			service.postMessage("demo-path", { message: "hi" } as any),
		).resolves.toEqual({
			response: "ok",
			agentName: "demo-path",
		});
		expect(hotReload.broadcastState).toHaveBeenCalled();
	});
});
