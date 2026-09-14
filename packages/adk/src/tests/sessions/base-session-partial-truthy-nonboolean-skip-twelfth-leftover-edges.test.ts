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
 * Twelfth leftover: BaseSessionService `if (event.partial)` is truthy —
 * non-boolean truthy values skip state update + push (unlike runners' falsy
 * partial append leftover).
 */
describe("base-session partial truthy-nonboolean skip twelfth leftover edges", () => {
	it.each([
		{ label: "1", partial: 1 },
		{ label: "string-x", partial: "x" },
		{ label: "array", partial: [] },
		{ label: "object", partial: {} },
	])("truthy non-boolean partial $label skips append", async ({ partial }) => {
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

	it.each([
		{ label: "false", partial: false },
		{ label: "0", partial: 0 },
		{ label: "empty-string", partial: "" },
		{ label: "null", partial: null },
		{ label: "undefined", partial: undefined },
	])("falsy partial $label still appends", async ({ partial }) => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			partial,
			actions: { stateDelta: { a: 2 } },
		} as Event;

		await service.appendEvent(session, event);
		expect(session.events).toEqual([event]);
		expect(session.state.a).toBe(2);
	});
});
