import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

/**
 * Ninth leftover: string `"0"` / `"false"` are truthy for `agent.name ||`
 * and session `userId`/`appName ||` defaults. Seventh leftover regenerates on
 * numeric `0` / boolean `false` / `""`, and preserves whitespace — not these
 * lookalike strings.
 */
describe("AgentBuilder name/session string-zero/false ninth leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("static withAgent($label) keeps name (no default_agent)", ({ value }) => {
		const stub = { name: value } as any;
		const builder = AgentBuilder.withAgent(stub);
		expect((builder as any).config.name).toBe(value);
		expect((builder as any).existingAgent).toBe(stub);
	});

	it("numeric 0 name still coalesces to default_agent (seventh control)", () => {
		const builder = AgentBuilder.withAgent({ name: 0 } as any);
		expect((builder as any).config.name).toBe("default_agent");
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("$label userId/appName are kept (not regenerated)", async ({ value }) => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("str_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: value,
				appName: value,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe(value);
		expect(createSession.mock.calls[0][1]).toBe(value);
	});

	it("falsy userId still regenerates via || (seventh control contrast)", async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("falsy_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: 0 as any,
				appName: false as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe("app-falsy_ids");
		expect(createSession.mock.calls[0][1]).toMatch(/^user-falsy_ids-/);
	});
});
