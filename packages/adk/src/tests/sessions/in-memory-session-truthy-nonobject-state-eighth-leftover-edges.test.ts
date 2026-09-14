import { describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Leftover: createSessionImpl uses `state || {}` — truthy non-objects are
 * kept as session.state (not coerced to {}).
 */
describe("in-memory session truthy non-object state eighth leftover edges", () => {
	it.each([
		{ label: "number 1", state: 1 },
		{ label: "string", state: "x" },
		{ label: "true", state: true },
		{ label: "array", state: [1, 2] },
	] as const)("createSession keeps truthy non-object state ($label)", async ({
		state,
	}) => {
		const service = new InMemorySessionService();
		const session = await service.createSession(
			"app",
			"user",
			state as unknown as Record<string, any>,
			`s-${String(state)}`,
		);
		expect(session.state).toEqual(state as unknown as object);
		expect(session.state).not.toEqual({});
	});

	it("empty object still kept as object (control)", async () => {
		const service = new InMemorySessionService();
		const empty = {};
		const session = await service.createSession(
			"app",
			"user",
			empty,
			"s-empty",
		);
		expect(session.state).toEqual({});
	});
});
