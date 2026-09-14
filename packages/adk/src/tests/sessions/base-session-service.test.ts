import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import {
	BaseSessionService,
	type GetSessionConfig,
	type ListSessionsResponse,
} from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

class InMemoryStubSessionService extends BaseSessionService {
	private readonly sessions = new Map<string, Session>();

	private key(appName: string, userId: string, sessionId: string): string {
		return `${appName}:${userId}:${sessionId}`;
	}

	async createSession(
		appName: string,
		userId: string,
		state: Record<string, any> = {},
		sessionId = "generated",
	): Promise<Session> {
		const session: Session = {
			id: sessionId,
			appName,
			userId,
			state: { ...state },
			events: [],
			lastUpdateTime: 0,
		};
		this.sessions.set(this.key(appName, userId, sessionId), session);
		return session;
	}

	async getSession(
		appName: string,
		userId: string,
		sessionId: string,
		_config?: GetSessionConfig,
	): Promise<Session | undefined> {
		return this.sessions.get(this.key(appName, userId, sessionId));
	}

	async listSessions(
		appName: string,
		userId: string,
	): Promise<ListSessionsResponse> {
		const sessions = [...this.sessions.values()].filter(
			(s) => s.appName === appName && s.userId === userId,
		);
		return { sessions };
	}

	async deleteSession(
		appName: string,
		userId: string,
		sessionId: string,
	): Promise<void> {
		this.sessions.delete(this.key(appName, userId, sessionId));
	}
}

describe("BaseSessionService.appendEvent", () => {
	it("skips partial events without mutating session", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial: true,
			actions: { stateDelta: { a: 2 } },
		} as Event;

		const result = await service.appendEvent(session, event);
		expect(result).toBe(event);
		expect(session.events).toEqual([]);
		expect(session.state).toEqual({ a: 1 });
	});

	it("applies stateDelta and appends the event", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			actions: { stateDelta: { a: 2, b: "new" } },
		} as Event;

		await service.appendEvent(session, event);
		expect(session.events).toEqual([event]);
		expect(session.state).toEqual({ a: 2, b: "new" });
	});

	it("skips temp_ keys and deletes null/undefined values", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ keep: true, removeNull: 1, removeUndef: 2 },
			"s1",
		);
		const event = {
			author: "agent",
			actions: {
				stateDelta: {
					temp_scratch: "ignored",
					removeNull: null,
					removeUndef: undefined,
					keep: true,
				},
			},
		} as Event;

		await service.appendEvent(session, event);
		expect(session.state.temp_scratch).toBeUndefined();
		expect(session.state.removeNull).toBeUndefined();
		expect(session.state.removeUndef).toBeUndefined();
		expect(session.state.keep).toBe(true);
	});

	it("appendEvent without actions leaves state untouched", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = { author: "agent" } as Event;

		await service.appendEvent(session, event);
		expect(session.events).toEqual([event]);
		expect(session.state).toEqual({ a: 1 });
	});

	it("appendEvent with empty stateDelta is a no-op on state", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			actions: { stateDelta: {} },
		} as Event;

		await service.appendEvent(session, event);
		expect(session.state).toEqual({ a: 1 });
		expect(session.events).toHaveLength(1);
	});

	it("stub service supports list and delete lifecycle", async () => {
		const service = new InMemoryStubSessionService();
		await service.createSession("app", "user", {}, "a");
		await service.createSession("app", "user", {}, "b");
		expect((await service.listSessions("app", "user")).sessions).toHaveLength(
			2,
		);
		await service.deleteSession("app", "user", "a");
		expect(
			(await service.listSessions("app", "user")).sessions.map((s) => s.id),
		).toEqual(["b"]);
		expect(await service.getSession("app", "user", "a")).toBeUndefined();
	});
});
