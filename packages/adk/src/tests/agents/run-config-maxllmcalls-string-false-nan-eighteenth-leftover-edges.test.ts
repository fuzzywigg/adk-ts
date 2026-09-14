import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { InvocationContext } from "../../agents/invocation-context";
import { RunConfig } from "../../agents/run-config";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

/**
 * Eighteenth leftover: sixth leftover warns on `"0"`/`""` via `<= 0`. String
 * `"false"` is kept via `??` with **no** warn (`"false" <= 0` → false); then
 * InvocationContext `"false" > 0` → false → unlimited calls.
 */
describe("RunConfig maxLlmCalls string-false NaN eighteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('string "false" is preserved via ?? and does not warn', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "false" as any });
		expect(config.maxLlmCalls).toBe("false");
		expect(warn).not.toHaveBeenCalled();
	});

	it('string "0" still warns (sixth control asymmetry)', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "0" as any });
		expect(config.maxLlmCalls).toBe("0");
		expect(warn).toHaveBeenCalled();
	});

	it('InvocationContext treats maxLlmCalls "false" as unlimited', () => {
		const ctx = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: { name: "root" } as BaseAgent,
			session: {
				id: "s",
				appName: "a",
				userId: "u",
				state: {},
				events: [],
			} as Session,
			runConfig: { maxLlmCalls: "false" } as any,
		});
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});
});
