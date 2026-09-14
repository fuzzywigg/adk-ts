import { describe, expect, it, vi } from "vitest";
import type { LoadedAgent } from "../../../common/types";
import { MessagingService } from "../../../http/messaging/messaging.service";

/**
 * Leftover: `body || defaults` only replaces nullish body; `{}` is truthy so
 * message/attachments stay undefined (unlike undefined/null which get "").
 */
describe("MessagingService body || empty-object leftover edges", () => {
	function makeService() {
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
		return { service, agentManager };
	}

	it("empty object body does not fill message/attachments defaults", async () => {
		const { service, agentManager } = makeService();
		await service.postMessage("demo", {} as never);
		expect(agentManager.sendMessageToAgent).toHaveBeenCalledWith(
			"demo",
			undefined,
			undefined,
		);
	});

	it('null body uses message "" and attachments [] via || defaults', async () => {
		const { service, agentManager } = makeService();
		await service.postMessage("demo", null as never);
		expect(agentManager.sendMessageToAgent).toHaveBeenCalledWith(
			"demo",
			"",
			[],
		);
	});
});
