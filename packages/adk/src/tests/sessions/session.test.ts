import { describe, expect, it } from "vitest";
import type { Session } from "../../sessions/session";

describe("Session", () => {
	it("represents a session interaction record", () => {
		const session: Session = {
			id: "sess-1",
			appName: "demo-app",
			userId: "user-1",
			state: { turn: 1 },
			events: [],
			lastUpdateTime: 1_700_000_000_000,
		};

		expect(session.id).toBe("sess-1");
		expect(session.appName).toBe("demo-app");
		expect(session.userId).toBe("user-1");
		expect(session.state.turn).toBe(1);
		expect(session.events).toEqual([]);
		expect(session.lastUpdateTime).toBe(1_700_000_000_000);
	});

	it("allows mutable state and event history", () => {
		const session: Session = {
			id: "sess-2",
			appName: "app",
			userId: "u",
			state: {},
			events: [],
			lastUpdateTime: 0,
		};

		session.state.flag = true;
		session.events.push({ author: "user" } as Session["events"][number]);
		session.lastUpdateTime = 42;

		expect(session.state.flag).toBe(true);
		expect(session.events).toHaveLength(1);
		expect(session.lastUpdateTime).toBe(42);
	});
});
