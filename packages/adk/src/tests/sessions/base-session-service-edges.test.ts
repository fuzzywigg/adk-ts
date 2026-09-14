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

describe("BaseSessionService leftover edges", () => {
	it("updateSessionState no-ops when actions are missing", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "agent",
			actions: undefined,
		} as Event);
		expect(session.state).toEqual({ a: 1 });
		expect(session.events).toHaveLength(1);
	});

	it("updateSessionState no-ops when stateDelta is missing", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "agent",
			actions: {},
		} as Event);
		expect(session.state).toEqual({ a: 1 });
	});

	it("skips temp_ prefixed keys while applying other stateDelta entries", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ keep: 1 },
			"s1",
		);
		await service.appendEvent(session, {
			author: "agent",
			actions: {
				stateDelta: {
					temp_scratch: "ignored",
					keep: 2,
					added: 3,
				},
			},
		} as Event);
		expect(session.state).toEqual({ keep: 2, added: 3 });
		expect(session.state.temp_scratch).toBeUndefined();
	});

	it("deletes keys when stateDelta values are null or undefined", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ a: 1, b: 2, c: 3 },
			"s1",
		);
		await service.appendEvent(session, {
			author: "agent",
			actions: {
				stateDelta: {
					a: null,
					b: undefined,
					c: 9,
				},
			},
		} as Event);
		expect(session.state).toEqual({ c: 9 });
		expect("a" in session.state).toBe(false);
		expect("b" in session.state).toBe(false);
	});

	it("ignores inherited stateDelta keys that are not own properties", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const proto = { inherited: "nope" };
		const stateDelta = Object.create(proto);
		stateDelta.a = 2;
		await service.appendEvent(session, {
			author: "agent",
			actions: { stateDelta },
		} as Event);
		expect(session.state).toEqual({ a: 2 });
		expect(session.state.inherited).toBeUndefined();
	});

	it("appends multiple non-partial events in order", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const first = {
			author: "user",
			content: { parts: [{ text: "1" }] },
		} as Event;
		const second = {
			author: "agent",
			content: { parts: [{ text: "2" }] },
		} as Event;
		await service.appendEvent(session, first);
		await service.appendEvent(session, second);
		expect(session.events).toEqual([first, second]);
	});

	it("partial events are skipped even when stateDelta is present", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		await service.appendEvent(session, {
			author: "agent",
			partial: true,
			actions: { stateDelta: { a: 99, b: 1 } },
		} as Event);
		expect(session.events).toEqual([]);
		expect(session.state).toEqual({ a: 1 });
	});

	it("falsy but present state values (0, false, empty string) are retained", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "agent",
			actions: {
				stateDelta: {
					n: 0,
					flag: false,
					label: "",
				},
			},
		} as Event);
		expect(session.state).toEqual({ n: 0, flag: false, label: "" });
	});
});
