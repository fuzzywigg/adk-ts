import { describe, expect, it } from "vitest";
import { InMemorySessionService } from "../../sessions/in-memory-session-service";

/**
 * Thirteenth leftover: `state: state || {}` — 0/false/"" become {}; [] and
 * populated objects are truthy and kept.
 */
describe("in-memory session state-or-empty-object thirteenth leftover edges", () => {
	it.each([
		{ label: "undefined", state: undefined },
		{ label: "null", state: null },
		{ label: "0", state: 0 },
		{ label: "false", state: false },
		{ label: "empty string", state: "" },
	])("falsy state ($label) coalesces to {}", async ({ state }) => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", state as any, "s");
		expect(session.state).toEqual({});
	});

	it("empty array is truthy and kept (unlike {})", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", [] as any, "s");
		expect(Array.isArray(session.state)).toBe(true);
		expect(session.state).toEqual([]);
	});

	it("empty object {} is truthy and kept as-is", async () => {
		const service = new InMemorySessionService();
		const empty = {};
		const session = await service.createSession("app", "u", empty, "s");
		expect(session.state).toEqual({});
	});

	it("populated state is preserved (control)", async () => {
		const service = new InMemorySessionService();
		const session = await service.createSession("app", "u", { k: 0 }, "s");
		expect(session.state.k).toBe(0);
	});
});
