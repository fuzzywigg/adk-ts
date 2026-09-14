import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import {
	BaseSessionService,
	type GetSessionConfig,
	type ListSessionsResponse,
} from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

class CapturingSessionService extends BaseSessionService {
	readonly sessions = new Map<string, Session>();

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

describe("BaseSessionService leftover edges", () => {
	it("appendEvent skips state update and history for partial events", async () => {
		const service = new CapturingSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const returned = await service.appendEvent(session, {
			author: "agent",
			partial: true,
			actions: { stateDelta: { a: 2, b: 3 } },
			content: { parts: [{ text: "stream" }] },
		} as Event);

		expect(returned.partial).toBe(true);
		expect(session.events).toHaveLength(0);
		expect(session.state).toEqual({ a: 1 });
	});

	it("updateSessionState deletes keys when delta value is null or undefined", async () => {
		const service = new CapturingSessionService();
		const session = await service.createSession(
			"app",
			"user",
			{ keep: 1, dropNull: 2, dropUndef: 3 },
			"s1",
		);

		await service.appendEvent(session, {
			author: "agent",
			actions: {
				stateDelta: {
					dropNull: null,
					dropUndef: undefined,
					keep: 9,
					temp_skip: "nope",
				},
			},
		} as Event);

		expect(session.state.keep).toBe(9);
		expect("dropNull" in session.state).toBe(false);
		expect("dropUndef" in session.state).toBe(false);
		expect(session.state.temp_skip).toBeUndefined();
		expect(session.events).toHaveLength(1);
	});

	it("updateSessionState no-ops when actions or stateDelta is missing", async () => {
		const service = new CapturingSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");

		await service.appendEvent(session, {
			author: "agent",
			content: { parts: [{ text: "plain" }] },
		} as Event);
		await service.appendEvent(session, {
			author: "agent",
			actions: {},
			content: { parts: [{ text: "no-delta" }] },
		} as Event);

		expect(session.state).toEqual({ a: 1 });
		expect(session.events).toHaveLength(2);
	});

	it("skips inherited prototype keys on stateDelta via Object.hasOwn", async () => {
		const service = new CapturingSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const delta = Object.create({ inherited: "nope" }) as Record<string, any>;
		delta.own = "yes";

		await service.appendEvent(session, {
			author: "agent",
			actions: { stateDelta: delta },
		} as Event);

		expect(session.state.own).toBe("yes");
		expect(session.state.inherited).toBeUndefined();
	});

	it("temp_ prefix keys are skipped even when own enumerable", async () => {
		const service = new CapturingSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		await service.appendEvent(session, {
			author: "agent",
			actions: {
				stateDelta: {
					temp_scratch: 1,
					temp_: 2,
					temporary: 3,
				},
			},
		} as Event);

		expect(session.state.temp_scratch).toBeUndefined();
		expect(session.state.temp_).toBeUndefined();
		expect(session.state.temporary).toBe(3);
	});

	it("appendEvent returns the same event instance", async () => {
		const service = new CapturingSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const event = {
			author: "user",
			content: { parts: [{ text: "hi" }] },
		} as Event;
		const returned = await service.appendEvent(session, event);
		expect(returned).toBe(event);
	});
});
