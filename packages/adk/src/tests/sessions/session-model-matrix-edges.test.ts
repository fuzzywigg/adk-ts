import { describe, expect, it } from "vitest";
import type { Session } from "../../sessions/session";

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "s1",
		appName: "app",
		userId: "user",
		state: {},
		events: [],
		lastUpdateTime: 0,
		...overrides,
	};
}

describe("Session model matrix leftover edges", () => {
	it("creates independent mutable state and events bags per session", () => {
		const a = makeSession({ id: "a" });
		const b = makeSession({ id: "b" });
		a.state.x = 1;
		a.events.push({ author: "a" } as Session["events"][number]);
		expect(b.state).toEqual({});
		expect(b.events).toEqual([]);
		expect(a.id).toBe("a");
		expect(b.id).toBe("b");
	});

	it("preserves nested state references when assigned", () => {
		const nested = { n: 1 };
		const session = makeSession({ state: { nested } });
		nested.n = 2;
		expect(session.state.nested.n).toBe(2);
	});

	it("allows empty string ids and zero timestamps", () => {
		const session = makeSession({
			id: "",
			appName: "",
			userId: "",
			lastUpdateTime: 0,
		});
		expect(session.id).toBe("");
		expect(session.appName).toBe("");
		expect(session.userId).toBe("");
		expect(session.lastUpdateTime).toBe(0);
	});

	it("supports fractional and large lastUpdateTime values", () => {
		const session = makeSession({ lastUpdateTime: 1_700_000_000.5 });
		expect(session.lastUpdateTime).toBe(1_700_000_000.5);
		session.lastUpdateTime = Number.MAX_SAFE_INTEGER;
		expect(session.lastUpdateTime).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("keeps event order when appending multiple events", () => {
		const session = makeSession();
		session.events.push(
			{ author: "user", timestamp: 1 } as Session["events"][number],
			{ author: "agent", timestamp: 2 } as Session["events"][number],
		);
		expect(session.events.map((e) => e.author)).toEqual(["user", "agent"]);
	});

	it("state keys can use app/user/temp prefixes", () => {
		const session = makeSession({
			state: {
				"app:theme": "dark",
				"user:locale": "en",
				"temp:scratch": true,
				local: 1,
			},
		});
		expect(session.state["app:theme"]).toBe("dark");
		expect(session.state["user:locale"]).toBe("en");
		expect(session.state["temp:scratch"]).toBe(true);
		expect(session.state.local).toBe(1);
	});
});
