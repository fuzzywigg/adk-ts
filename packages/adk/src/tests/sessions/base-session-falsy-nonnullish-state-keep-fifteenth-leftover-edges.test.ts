import { describe, expect, it } from "vitest";
import { Event } from "../../events/event";
import { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

class ProbeBase extends BaseSessionService {
	async createSession(): Promise<Session> {
		throw new Error("unused");
	}
	async getSession(): Promise<Session | undefined> {
		throw new Error("unused");
	}
	async listSessions() {
		return { sessions: [] };
	}
	async deleteSession(): Promise<void> {}
	exposeUpdate(session: Session, event: Event) {
		(this as any).updateSessionState(session, event);
	}
}

/**
 * Fifteenth leftover: updateSessionState only deletes null/undefined —
 * 0 / false / "" are assigned and kept.
 */
describe("base session falsy non-nullish state keep fifteenth leftover", () => {
	it("keeps 0 / false / empty-string state deltas", () => {
		const base = new ProbeBase();
		const session: Session = {
			id: "s",
			appName: "app",
			userId: "u",
			state: { a: 1, b: true, c: "x" },
			events: [],
			lastUpdateTime: 0,
		};
		base.exposeUpdate(
			session,
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp: 1,
				actions: {
					stateDelta: { a: 0, b: false, c: "" },
				} as any,
			}),
		);
		expect(session.state).toEqual({ a: 0, b: false, c: "" });
	});

	it("still deletes null/undefined (control)", () => {
		const base = new ProbeBase();
		const session: Session = {
			id: "s",
			appName: "app",
			userId: "u",
			state: { a: 1, b: 2 },
			events: [],
			lastUpdateTime: 0,
		};
		base.exposeUpdate(
			session,
			new Event({
				author: "agent",
				invocationId: "inv",
				timestamp: 1,
				actions: {
					stateDelta: { a: null, b: undefined },
				} as any,
			}),
		);
		expect(session.state).not.toHaveProperty("a");
		expect(session.state).not.toHaveProperty("b");
	});
});
