import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

/**
 * Eighth leftover: withSessionService `userId/appName || generateDefault*`.
 * Leftover matrix pinned empty string only; 0/false/null also coalesce.
 */
describe("AgentBuilder session userId/appName falsy || eighth leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "0", userId: 0, appName: 0 },
		{ label: "false", userId: false, appName: false },
		{ label: "null", userId: null, appName: null },
	])("$label userId and appName fall back to generated defaults", async ({
		userId,
		appName,
	}) => {
		const createSession = vi.spyOn(sessionService, "createSession");
		const { session } = await AgentBuilder.create("falsy_or_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: userId as any,
				appName: appName as any,
			})
			.build();

		expect(createSession.mock.calls[0][0]).toMatch(/^app-falsy_or_ids$/);
		expect(createSession.mock.calls[0][1]).toMatch(/^user-falsy_or_ids-/);
		expect(session.appName).toMatch(/^app-falsy_or_ids$/);
		expect(session.userId).toMatch(/^user-falsy_or_ids-/);
	});

	it('string "0" userId/appName are truthy and preserved', async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		const { session } = await AgentBuilder.create("keep_zero_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: "0",
				appName: "0",
			})
			.build();

		expect(createSession.mock.calls[0][0]).toBe("0");
		expect(createSession.mock.calls[0][1]).toBe("0");
		expect(session.appName).toBe("0");
		expect(session.userId).toBe("0");
	});
});
