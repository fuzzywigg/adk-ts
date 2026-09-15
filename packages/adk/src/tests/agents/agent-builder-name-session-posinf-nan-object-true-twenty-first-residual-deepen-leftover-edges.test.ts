import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

/**
 * Twenty-first leftover residual deepen (complements #251 true/negzero
 * name/session): `name || "default_agent"` / session ids `||` — POSITIVE_INFINITY
 * / `1` / `{}` / `Object(true)` keep; `NaN` coalesces to defaults.
 */
describe("AgentBuilder name/session posinf/nan/object-true twenty-first residual deepen", () => {
	let sessionService: InMemorySessionService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		vi.restoreAllMocks();
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("static withAgent($label) keeps name (no default_agent)", ({ value }) => {
		const stub = { name: value } as any;
		const builder = AgentBuilder.withAgent(stub);
		expect((builder as any).config.name).toBe(value);
		expect((builder as any).existingAgent).toBe(stub);
	});

	it("NaN name coalesces to default_agent", () => {
		const builder = AgentBuilder.withAgent({ name: Number.NaN } as any);
		expect((builder as any).config.name).toBe("default_agent");
	});

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("$label userId/appName are kept (not regenerated)", async ({ value }) => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("residual_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: value as any,
				appName: value as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe(value);
		expect(createSession.mock.calls[0][1]).toBe(value);
	});

	it("NaN userId/appName still regenerate via ||", async () => {
		const createSession = vi.spyOn(sessionService, "createSession");
		await AgentBuilder.create("nan_ids")
			.withModel("gemini-2.5-flash")
			.withSessionService(sessionService, {
				userId: Number.NaN as any,
				appName: Number.NaN as any,
			})
			.build();
		expect(createSession.mock.calls[0][0]).toBe("app-nan_ids");
		expect(createSession.mock.calls[0][1]).toMatch(/^user-nan_ids-/);
	});
});
