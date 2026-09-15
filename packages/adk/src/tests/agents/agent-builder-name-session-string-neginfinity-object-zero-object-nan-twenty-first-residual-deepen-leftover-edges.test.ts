import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

/**
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `name || "default_agent"` / session ids `||` — string `"-Infinity"` /
 * `Object(0)` / `Object(NaN)` keep.
 */
describe("AgentBuilder name/session string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("static withAgent($label) keeps name (no default_agent)", ({ value }) => {
		const stub = { name: value } as any;
		const builder = AgentBuilder.withAgent(stub);
		expect((builder as any).config.name).toBe(value);
		expect((builder as any).existingAgent).toBe(stub);
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("$label userId/appName are kept (not regenerated)", async ({ value }) => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("str_neginf_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: value as any,
				appName: value as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe(value);
		expect(createSession.mock.calls[0][1]).toBe(value);
	});
});
