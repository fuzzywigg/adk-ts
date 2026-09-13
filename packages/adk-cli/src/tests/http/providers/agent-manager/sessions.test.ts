import { createHash } from "node:crypto";
import { InMemorySessionService } from "@iqai/adk";
import type { BaseAgent, BuiltAgent, EnhancedRunner } from "@iqai/adk";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_APP_NAME, USER_ID_PREFIX } from "../../../../common/constants";
import type { Agent } from "../../../../common/types";
import {
	clearAgentSessions,
	getExistingSession,
	getOrCreateSession,
	hashState,
	storeLoadedAgent,
} from "../../../../http/providers/agent-manager/sessions";

function stubLogger() {
	return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe("hashState", () => {
	it("returns empty for missing or empty state", () => {
		expect(hashState(undefined)).toBe("empty");
		expect(hashState({})).toBe("empty");
	});

	it("returns stable sha256 for the same state", () => {
		const state = { a: 1, b: "two" };
		const expected = createHash("sha256")
			.update(JSON.stringify(state))
			.digest("hex");
		expect(hashState(state)).toBe(expected);
		expect(hashState(state)).toBe(hashState({ a: 1, b: "two" }));
	});
});

describe("getOrCreateSession", () => {
	const agentPath = "/agents/demo";
	const userId = `${USER_ID_PREFIX}${agentPath}`;

	it("reuses the newest existing session", async () => {
		const sessionService = new InMemorySessionService();
		await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{ v: 1 },
			"older",
		);
		await new Promise((r) => setTimeout(r, 20));
		await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{ v: 2 },
			"newer",
		);

		const logger = stubLogger();
		const session = await getOrCreateSession(
			sessionService,
			agentPath,
			{ agent: { name: "demo" } as BaseAgent },
			() => undefined,
			logger,
		);

		expect(session.id).toBe("newer");
		expect(logger.log).toHaveBeenCalled();
	});

	it("initializes empty session state from extractInitialState", async () => {
		const sessionService = new InMemorySessionService();
		await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{},
			"empty-state",
		);
		const logger = stubLogger();
		const initialState = { seeded: true };

		const session = await getOrCreateSession(
			sessionService,
			agentPath,
			{ agent: { name: "demo" } as BaseAgent },
			() => initialState,
			logger,
		);

		expect(session.id).toBe("empty-state");
		expect(session.state).toEqual(initialState);
		expect(
			logger.log.mock.calls.some((c) => String(c[0]).includes("no state")),
		).toBe(true);
	});

	it("creates a new session when none exist", async () => {
		const sessionService = new InMemorySessionService();
		const logger = stubLogger();
		const session = await getOrCreateSession(
			sessionService,
			agentPath,
			{ agent: { name: "demo" } as BaseAgent },
			() => ({ fresh: true }),
			logger,
		);

		expect(session.state).toEqual({ fresh: true });
		expect(session.userId).toBe(userId);
	});
});

describe("getExistingSession", () => {
	const agentPath = "/agents/restore";
	const userId = `${USER_ID_PREFIX}${agentPath}`;

	it("restores an existing session by id", async () => {
		const sessionService = new InMemorySessionService();
		await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{ ok: true },
			"keep-me",
		);
		const logger = stubLogger();

		const session = await getExistingSession(
			sessionService,
			agentPath,
			"keep-me",
			logger,
		);

		expect(session.id).toBe("keep-me");
		expect(logger.log).toHaveBeenCalledWith(
			expect.stringContaining("Restored existing session"),
		);
	});

	it("creates a new session when id is missing", async () => {
		const sessionService = new InMemorySessionService();
		const logger = stubLogger();

		const session = await getExistingSession(
			sessionService,
			agentPath,
			"missing-id",
			logger,
		);

		expect(session.id).not.toBe("missing-id");
		expect(session.userId).toBe(userId);
	});
});

describe("clearAgentSessions", () => {
	it("deletes all sessions for an agent path", async () => {
		const agentPath = "/agents/clear";
		const userId = `${USER_ID_PREFIX}${agentPath}`;
		const sessionService = new InMemorySessionService();
		await sessionService.createSession(DEFAULT_APP_NAME, userId, {}, "a");
		await sessionService.createSession(DEFAULT_APP_NAME, userId, {}, "b");
		const logger = stubLogger();

		await clearAgentSessions(sessionService, agentPath, logger);

		const remaining = await sessionService.listSessions(
			DEFAULT_APP_NAME,
			userId,
		);
		expect(remaining.sessions).toHaveLength(0);
		expect(logger.log).toHaveBeenCalled();
	});
});

describe("storeLoadedAgent", () => {
	it("calls setLoaded and ensures session exists", async () => {
		const agentPath = "/agents/store";
		const userId = `${USER_ID_PREFIX}${agentPath}`;
		const sessionService = new InMemorySessionService();
		const session = await sessionService.createSession(
			DEFAULT_APP_NAME,
			userId,
			{ x: 1 },
			"sid",
		);
		const logger = stubLogger();
		const setLoaded = vi.fn();
		const setBuilt = vi.fn();
		const agent: Agent = {
			relativePath: "demo",
			name: "old",
			absolutePath: agentPath,
			projectRoot: "/tmp",
		};
		const baseAgent = { name: "loaded-agent" } as BaseAgent;
		const builtAgent = { session } as unknown as BuiltAgent;
		const runner = { ask: vi.fn() } as unknown as EnhancedRunner;

		await storeLoadedAgent(
			sessionService,
			agentPath,
			{ agent: baseAgent, builtAgent },
			runner,
			session,
			agent,
			setLoaded,
			logger,
			setBuilt,
		);

		expect(setLoaded).toHaveBeenCalledWith(agentPath, {
			agent: baseAgent,
			runner,
			sessionId: "sid",
			userId,
			appName: DEFAULT_APP_NAME,
		});
		expect(setBuilt).toHaveBeenCalledWith(agentPath, builtAgent);
		expect(agent.instance).toBe(baseAgent);
		expect(agent.name).toBe("loaded-agent");
		expect(logger.log).toHaveBeenCalledWith(
			expect.stringContaining("Session already exists"),
		);
	});
});
