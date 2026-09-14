import { createHash } from "node:crypto";
import type { BaseAgent } from "@iqai/adk";
import { InMemorySessionService } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_NAME, USER_ID_PREFIX } from "../../../../common/constants";
import {
	getOrCreateSession,
	hashState,
	storeLoadedAgent,
} from "../../../../http/providers/agent-manager/sessions";

/**
 * Leftover: hashState keeps objects with falsy values (keys.length > 0);
 * null is empty via !state; getOrCreateSession treats {count:0} as hasState.
 */
describe("hashState / getOrCreateSession falsy-value leftover edges", () => {
	it("hashState keeps objects whose values are 0/false/''", () => {
		expect(hashState({ count: 0 })).not.toBe("empty");
		expect(hashState({ ok: false })).not.toBe("empty");
		expect(hashState({ name: "" })).not.toBe("empty");
		expect(hashState({ count: 0 })).toBe(
			createHash("sha256")
				.update(JSON.stringify({ count: 0 }))
				.digest("hex"),
		);
	});

	it("hashState(null as any) is empty via !state", () => {
		expect(hashState(null as never)).toBe("empty");
	});

	it("re-seeds when listSessions returns empty state even if create had { count: 0 }", async () => {
		const agentPath = "/agents/zero-state";
		const userId = `${USER_ID_PREFIX}${agentPath}`;
		const sessionService = new InMemorySessionService();
		await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{ count: 0 },
			"keep-zero",
		);
		const listed = await sessionService.listSessions(DEFAULT_APP_NAME, userId);
		expect(listed.sessions[0].state).toEqual({});
		expect(hashState({ count: 0 })).not.toBe("empty");

		const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
		const session = await getOrCreateSession(
			sessionService,
			agentPath,
			{ agent: { name: "demo" } as BaseAgent },
			() => ({ seeded: true }),
			logger,
		);
		expect(session.id).toBe("keep-zero");
		expect(session.state).toEqual({ seeded: true });
		expect(
			logger.log.mock.calls.some((c) => String(c[0]).includes("no state")),
		).toBe(true);
	});

	it("re-seeds when existing state is {} and extract returns {}", async () => {
		const agentPath = "/agents/empty-obj-seed";
		const userId = `${USER_ID_PREFIX}${agentPath}`;
		const sessionService = new InMemorySessionService();
		await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{},
			"empty-state",
		);
		const logger = { log: vi.fn() };
		const session = await getOrCreateSession(
			sessionService,
			agentPath,
			{ agent: { name: "demo" } as BaseAgent },
			() => ({}),
			logger,
		);
		expect(session.state).toEqual({});
		expect(
			logger.log.mock.calls.some((c) => String(c[0]).includes("no state")),
		).toBe(true);
	});

	it("storeLoadedAgent skips setBuilt when omitted even with builtAgent", async () => {
		const agentPath = "/agents/no-set-built";
		const userId = `${USER_ID_PREFIX}${agentPath}`;
		const sessionService = new InMemorySessionService();
		const session = await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{},
			"sid",
		);
		const setLoaded = vi.fn();
		await storeLoadedAgent(
			sessionService,
			agentPath,
			{
				agent: { name: "x" } as BaseAgent,
				builtAgent: { agent: {}, runner: {}, session: {} } as never,
			},
			{ ask: vi.fn() } as never,
			session,
			{
				relativePath: "x",
				name: "old",
				absolutePath: agentPath,
				projectRoot: "/tmp",
			},
			setLoaded,
			{ log: vi.fn(), error: vi.fn() },
		);
		expect(setLoaded).toHaveBeenCalled();
	});
});
