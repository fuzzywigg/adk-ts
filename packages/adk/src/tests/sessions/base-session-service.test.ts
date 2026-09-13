import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import {
	BaseSessionService,
	type GetSessionConfig,
	type ListSessionsResponse,
} from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

class StubSessionService extends BaseSessionService {
	async createSession(
		appName: string,
		userId: string,
		state?: Record<string, any>,
		sessionId?: string,
	): Promise<Session> {
		return {
			id: sessionId || "sess-1",
			appName,
			userId,
			state: state || {},
			events: [],
			lastUpdateTime: 0,
		};
	}

	async getSession(
		_appName: string,
		_userId: string,
		_sessionId: string,
		_config?: GetSessionConfig,
	): Promise<Session | undefined> {
		return undefined;
	}

	async listSessions(
		_appName: string,
		_userId: string,
	): Promise<ListSessionsResponse> {
		return { sessions: [] };
	}

	async deleteSession(
		_appName: string,
		_userId: string,
		_sessionId: string,
	): Promise<void> {}
}

function makeSession(state: Record<string, any> = {}): Session {
	return {
		id: "s1",
		appName: "app",
		userId: "u1",
		state,
		events: [],
		lastUpdateTime: 0,
	};
}

describe("BaseSessionService", () => {
	const service = new StubSessionService();

	it("skips appending partial events", async () => {
		const session = makeSession();
		const event = new Event({
			author: "agent",
			partial: true,
			content: { role: "model", parts: [{ text: "streaming" }] },
		});

		const result = await service.appendEvent(session, event);
		expect(result).toBe(event);
		expect(session.events).toHaveLength(0);
	});

	it("appends non-partial events and applies stateDelta", async () => {
		const session = makeSession({ existing: "keep" });
		const actions = new EventActions();
		actions.stateDelta = {
			counter: 2,
			existing: "updated",
		};
		const event = new Event({
			author: "agent",
			actions,
			content: { role: "model", parts: [{ text: "done" }] },
		});

		await service.appendEvent(session, event);
		expect(session.events).toEqual([event]);
		expect(session.state).toEqual({ existing: "updated", counter: 2 });
	});

	it("skips temp_ keys in stateDelta", async () => {
		const session = makeSession({ visible: 1 });
		const actions = new EventActions();
		actions.stateDelta = {
			temp_secret: "nope",
			visible: 2,
		};
		const event = new Event({ author: "agent", actions });

		await service.appendEvent(session, event);
		expect(session.state).toEqual({ visible: 2 });
		expect(session.state.temp_secret).toBeUndefined();
	});

	it("deletes state keys when delta value is null or undefined", async () => {
		const session = makeSession({ a: 1, b: 2, c: 3 });
		const actions = new EventActions();
		actions.stateDelta = {
			a: null,
			b: undefined,
			c: 9,
		};
		const event = new Event({ author: "agent", actions });

		await service.appendEvent(session, event);
		expect(session.state).toEqual({ c: 9 });
	});

	it("does nothing when event has no stateDelta", async () => {
		const session = makeSession({ x: 1 });
		const event = new Event({ author: "user" });

		await service.appendEvent(session, event);
		expect(session.state).toEqual({ x: 1 });
		expect(session.events).toHaveLength(1);
	});
});
