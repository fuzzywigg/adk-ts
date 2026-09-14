import { describe, expect, it, vi } from "vitest";
import type { LoadedAgent } from "../../../common/types";
import { MessagingService } from "../../../http/messaging/messaging.service";

/**
 * Leftover: author !== "user" is case-sensitive; empty author wins via ??;
 * eventsResp.events || [] treats null/undefined as no assistant events.
 */
describe("MessagingService author case / events || leftover edges", () => {
	function makeService(events: unknown) {
		const loaded = {
			sessionId: "s1",
			agent: { name: "solo" },
		} as LoadedAgent;
		const sessionsService = {
			ensureAgentLoaded: vi.fn().mockResolvedValue(loaded),
			getSessionEvents: vi.fn().mockResolvedValue({
				events,
				totalCount: Array.isArray(events) ? events.length : 0,
			}),
		};
		const agentManager = {
			sendMessageToAgent: vi.fn().mockResolvedValue("ok"),
		};
		const service = new MessagingService(
			agentManager as never,
			sessionsService as never,
		);
		return service;
	}

	it('treats author "User" as non-user (case-sensitive !==)', async () => {
		const service = makeService([{ author: "User", isFinalResponse: true }]);
		await expect(
			service.postMessage("demo", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "ok", agentName: "User" });
	});

	it("keeps empty-string author via ?? over loaded.agent.name", async () => {
		const service = makeService([{ author: "", isFinalResponse: true }]);
		await expect(
			service.postMessage("demo", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "ok", agentName: "" });
	});

	it("events: null falls back to [] then loaded.agent.name", async () => {
		const service = makeService(null);
		await expect(
			service.postMessage("demo", { message: "hi", attachments: [] }),
		).resolves.toEqual({ response: "ok", agentName: "solo" });
	});
});
