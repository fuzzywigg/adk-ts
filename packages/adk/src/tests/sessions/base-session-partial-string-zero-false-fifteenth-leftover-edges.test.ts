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

/**
 * Fifteenth leftover: `if (event.partial)` — twelfth pins truthy `"x"`/1/[]/{}
 * skip and falsy 0/"" append. String `"0"` / `"false"` are truthy and skip
 * (asymmetry vs numeric 0 / boolean false).
 */
describe("base-session partial string-zero-false truthy skip fifteenth leftover", () => {
	it.each([
		"0",
		"false",
	])('partial: "%s" skips append (truthy string)', async (partial) => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial,
			actions: { stateDelta: { a: 2 } },
		} as Event;

		const result = await service.appendEvent(session, event);
		expect(result).toBe(event);
		expect(session.events).toEqual([]);
		expect(session.state).toEqual({ a: 1 });
	});

	it("numeric 0 still appends (twelfth/ninth control)", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial: 0,
			actions: { stateDelta: { a: 2 } },
		} as Event;

		await service.appendEvent(session, event);
		expect(session.events).toEqual([event]);
		expect(session.state.a).toBe(2);
	});
});
