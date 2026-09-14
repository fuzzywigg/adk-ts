import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

/**
 * Fifteenth leftover: append stores `key.substring(APP_PREFIX|USER_PREFIX)`
 * even when the remainder is empty (`"app:"` / `"user:"`), and mergeState
 * resurfaces them under the bare prefix keys.
 */
describe("in-memory app/user empty-suffix key fifteenth leftover", () => {
	let memory: InMemorySessionService;

	beforeEach(() => {
		memory = new InMemorySessionService();
	});

	it('stores "app:" / "user:" under empty map keys and merge resurfaces', async () => {
		const session = await memory.createSession("app", "u", {}, "s-empty");
		await memory.appendEvent(session, {
			id: "e1",
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[State.APP_PREFIX]: "app-empty",
					[State.USER_PREFIX]: "user-empty",
				},
			},
		} as any);

		const appMap = (memory as any).appState.get("app") as Map<string, unknown>;
		const userMap = (memory as any).userState.get("app").get("u") as Map<
			string,
			unknown
		>;
		expect(appMap.has("")).toBe(true);
		expect(appMap.get("")).toBe("app-empty");
		expect(userMap.has("")).toBe(true);
		expect(userMap.get("")).toBe("user-empty");

		const fetched = await memory.getSession("app", "u", "s-empty");
		expect(fetched?.state[State.APP_PREFIX]).toBe("app-empty");
		expect(fetched?.state[State.USER_PREFIX]).toBe("user-empty");
	});

	it("normal non-empty suffix keys still work (control)", async () => {
		const session = await memory.createSession("app", "u", {}, "s-ok");
		await memory.appendEvent(session, {
			id: "e1",
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}theme`]: "dark",
					[`${State.USER_PREFIX}locale`]: "en",
				},
			},
		} as any);
		const fetched = await memory.getSession("app", "u", "s-ok");
		expect(fetched?.state[`${State.APP_PREFIX}theme`]).toBe("dark");
		expect(fetched?.state[`${State.USER_PREFIX}locale`]).toBe("en");
	});
});
