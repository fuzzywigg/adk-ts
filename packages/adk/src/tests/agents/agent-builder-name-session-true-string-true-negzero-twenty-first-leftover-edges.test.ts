import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

/**
 * Twenty-first leftover: ninth pins name/session `"0"`/`"false"` keep.
 * Assert `"true"` / boolean `true` keep for withAgent name and session ids;
 * SameValueZero `-0` coalesces to defaults — residual true asymmetry after
 * twentieth description/maxIterations tip.
 */
describe("AgentBuilder name/session true/string-true/negzero twenty-first leftover", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("static withAgent($label) keeps name (no default_agent)", ({ value }) => {
		const stub = { name: value } as any;
		const builder = AgentBuilder.withAgent(stub);
		expect((builder as any).config.name).toBe(value);
		expect((builder as any).existingAgent).toBe(stub);
	});

	it("SameValueZero -0 name coalesces to default_agent", () => {
		const builder = AgentBuilder.withAgent({ name: -0 } as any);
		expect((builder as any).config.name).toBe("default_agent");
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("$label userId/appName are kept (not regenerated)", async ({ value }) => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("true_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: value as any,
				appName: value as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe(value);
		expect(createSession.mock.calls[0][1]).toBe(value);
	});

	it("SameValueZero -0 userId/appName still regenerate via ||", async () => {
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

	it('string "false" userId still kept (ninth control asymmetry)', async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("false_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: "false",
				appName: "false",
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe("false");
		expect(createSession.mock.calls[0][1]).toBe("false");
	});
});
