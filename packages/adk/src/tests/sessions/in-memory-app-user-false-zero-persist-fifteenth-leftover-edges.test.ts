import { beforeEach, describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";
import { State } from "../../sessions/state";

/**
 * Fifteenth leftover: in-memory app:/user: maps persist false/0 (not just null
 * from fourteenth). Session-local false/0 kept by Base (non-nullish).
 */
describe("in-memory app-user false-zero persist fifteenth leftover", () => {
	let memory: InMemorySessionService;

	beforeEach(() => {
		memory = new InMemorySessionService();
	});

	it("false/0 app:/user: deltas persist via mergeState maps", async () => {
		const session = await memory.createSession(
			"app",
			"u",
			{
				[`${State.APP_PREFIX}flag`]: true,
				[`${State.USER_PREFIX}count`]: 1,
				local: "yes",
			},
			"s1",
		);

		await memory.appendEvent(session, {
			id: "e1",
			author: "agent",
			timestamp: 1,
			actions: {
				stateDelta: {
					[`${State.APP_PREFIX}flag`]: false,
					[`${State.USER_PREFIX}count`]: 0,
					local: false,
				},
			},
		} as any);

		const fetched = await memory.getSession("app", "u", "s1");
		expect(fetched?.state[`${State.APP_PREFIX}flag`]).toBe(false);
		expect(fetched?.state[`${State.USER_PREFIX}count`]).toBe(0);
		expect(fetched?.state.local).toBe(false);
		expect(session.state.local).toBe(false);
	});
});
