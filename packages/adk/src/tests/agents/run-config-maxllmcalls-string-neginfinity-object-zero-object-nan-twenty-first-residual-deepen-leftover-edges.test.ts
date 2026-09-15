import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import { InvocationContext } from "../../agents/invocation-context";
import { RunConfig } from "../../agents/run-config";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

/**
 * Twenty-first leftover residual deepen (complements #292 string-inf/obj-one/obj-false):
 * `??` preserve — string `"-Infinity"` / `Object(0)` warn (`<= 0`); `Object(NaN)`
 * no warn (`NaN <= 0` is false). InvocationContext: all three unlimited (`> 0`
 * false for -Inf / 0 / NaN).
 */
describe("RunConfig maxLlmCalls string-neginfinity/object-zero/object-nan twenty-first residual deepen", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeCtx(maxLlmCalls: unknown): InvocationContext {
		return new InvocationContext({
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
			runConfig: { maxLlmCalls } as any,
		});
	}

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
	])("$label is preserved via ?? and warns (<= 0 path)", ({ value }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: value as any });
		expect(config.maxLlmCalls).toBe(value);
		expect(warn).toHaveBeenCalled();
	});

	it("Object(NaN) is preserved via ?? and does not warn (NaN <= 0 is false)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const boxed = Object(Number.NaN);
		const config = new RunConfig({ maxLlmCalls: boxed as any });
		expect(config.maxLlmCalls).toBe(boxed);
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("$label maxLlmCalls stays unlimited in InvocationContext", ({ value }) => {
		const ctx = makeCtx(value);
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});
});
