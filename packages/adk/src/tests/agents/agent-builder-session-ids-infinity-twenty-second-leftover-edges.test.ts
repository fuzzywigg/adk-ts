import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after tip #258–#261):
 * twenty-first pins userId/appName true/`"true"`/`-0`. Assert ±Infinity /
 * `[]` keep via `||` defaults — residual sentinel deepen on session ids.
 */
describe("AgentBuilder session ids infinity twenty-second leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("$label userId/appName are kept (not regenerated)", async ({ value }) => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("inf_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: value as any,
				appName: value as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe(value);
		expect(createSession.mock.calls[0][1]).toBe(value);
	});

	it("empty-array userId/appName are kept (truthy ||)", async () => {
		const empty: never[] = [];
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("arr_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: empty as any,
				appName: empty as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe(empty);
		expect(createSession.mock.calls[0][1]).toBe(empty);
	});

	it("SameValueZero -0 userId/appName still regenerate (twenty-first control)", async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("neg0_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: -0 as any,
				appName: -0 as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe("app-neg0_ids");
		expect(createSession.mock.calls[0][1]).toMatch(/^user-neg0_ids-/);
	});
});
