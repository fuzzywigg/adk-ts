import { describe, expect, it } from "vitest";
import type { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
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
 * Twelfth leftover: `key.startsWith("temp_")` is case-sensitive.
 * `Temp_` / `TEMP_` are applied; only exact `temp_` is skipped.
 */
describe("base-session temp_ prefix case-sensitivity twelfth leftover edges", () => {
	it("cased Temp_/TEMP_ keys are applied; exact temp_ is skipped", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", {}, "s1");
		const event = {
			author: "agent",
			actions: new EventActions({
				stateDelta: {
					temp_drop: "gone",
					Temp_keep: 1,
					TEMP_keep: 2,
					temp: 3,
					_temp_x: 4,
				},
			}),
		} as Event;

		await service.appendEvent(session, event);
		expect(session.state).not.toHaveProperty("temp_drop");
		expect(session.state.Temp_keep).toBe(1);
		expect(session.state.TEMP_keep).toBe(2);
		expect(session.state.temp).toBe(3);
		expect(session.state._temp_x).toBe(4);
	});

	it("exact lowercase temp_ still skipped (control)", async () => {
		const service = new InMemoryStubSessionService();
		const session = await service.createSession("app", "user", { a: 1 }, "s1");
		const event = {
			author: "agent",
			actions: new EventActions({
				stateDelta: {
					temp_scratch: "nope",
					plain: "yes",
				},
			}),
		} as Event;

		await service.appendEvent(session, event);
		expect(session.state).toEqual({ a: 1, plain: "yes" });
	});
});
