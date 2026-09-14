import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import {
	BaseSessionService,
	type GetSessionConfig,
	type ListSessionsResponse,
} from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

class StubSessionService extends BaseSessionService {
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
		return {
			sessions: [...this.sessions.values()].filter(
				(s) => s.appName === appName && s.userId === userId,
			),
		};
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
 * Leftover: appendEvent early-returns on truthy partial only — falsy 0 / ""
 * still mutate state and push the event (unlike partial: true).
 */
describe("base-session partial falsy no early-exit ninth leftover edges", () => {
	it.each([
		0,
		"",
	] as const)("partial: %j is falsy so appendEvent mutates session", async (partial) => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial,
			actions: { stateDelta: { a: 2 } },
		} as Event;

		const result = await service.appendEvent(session, event);
		expect(result).toBe(event);
		expect(session.events).toHaveLength(1);
		expect(session.state).toEqual({ a: 2 });
	});

	it("partial: true still early-returns (control)", async () => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial: true,
			actions: { stateDelta: { a: 2 } },
		} as Event;

		await service.appendEvent(session, event);
		expect(session.events).toEqual([]);
		expect(session.state).toEqual({ a: 1 });
	});

	it("partial: false appends and mutates (control)", async () => {
		const service = new StubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial: false,
			actions: { stateDelta: { a: 9 } },
		} as Event;

		await service.appendEvent(session, event);
		expect(session.events).toHaveLength(1);
		expect(session.state).toEqual({ a: 9 });
	});
});
