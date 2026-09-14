import { describe, expect, it, vi } from "vitest";
import type { LoadedAgent } from "../../../common/types";
import { MessagingService } from "../../../http/messaging/messaging.service";

describe("MessagingService events nullish / final truthiness leftover edges", () => {
	it("treats nullish events via || [] and falls back to loaded agent name", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "solo" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: null,
				totalCount: 0,
			}),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("ok"),
		};
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
		);

		await expect(
			service.postMessage("demo", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "ok", agentName: "solo" });
	});

	it("keeps truthy non-boolean isFinalResponse (1) as final", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "fallback" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: [
					{ author: "worker", isFinalResponse: 1 },
					{ author: "narrator", isFinalResponse: 0 },
				],
				totalCount: 2,
			}),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("ok"),
		};
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
		);

		await expect(
			service.postMessage("demo", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "ok", agentName: "worker" });
	});

	it("treats author User as non-user (case-sensitive !== user)", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "fallback" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events: [{ author: "User", isFinalResponse: true }],
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

		await expect(
			service.postMessage("demo", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "ok", agentName: "User" });
	});

	it("skips broadcastState when ensureAgentLoaded returns null after send", async () => {
		const sessionsService = {
			ensureAgentLoaded: vi
				.fn()
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(null),
			getSessionEvents: vi.fn(),
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

		await expect(
			service.postMessage("missing", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "pong", agentName: "missing" });
		expect(hotReload.broadcastState).not.toHaveBeenCalled();
	});

	it("defaults attachments when body has message but omits attachments", async () => {
		const loaded = {
			sessionId: "s1",
			agent: { name: "solo" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi
				.fn()
				.mockResolvedValue({ events: [], totalCount: 0 }),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("ok"),
		};
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
		);

		await service.postMessage("demo", { message: "only-msg" } as never);
		expect(agentManager.sendMessageToAgent).toHaveBeenCalledWith(
			"demo",
			"only-msg",
			undefined,
		);
	});
});
