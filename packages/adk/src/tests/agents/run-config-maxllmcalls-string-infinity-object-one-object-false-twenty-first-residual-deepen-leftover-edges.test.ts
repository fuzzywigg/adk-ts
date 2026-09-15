import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAgent } from "../../agents/base-agent";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
} from "../../agents/invocation-context";
import { RunConfig } from "../../agents/run-config";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

/**
 * Twenty-first leftover residual deepen (complements #284 posinf/nan/object-true):
 * `??` preserve — string `"Infinity"` / `Object(1)` no warn; `Object(false)`
 * warns (`<= 0`); InvocationContext: `"Infinity"` unlimited; `Object(1)`
 * enforces; `Object(false)` unlimited (`> 0` false).
 */
describe("RunConfig maxLlmCalls string-infinity/object-one/object-false twenty-first residual deepen", () => {
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
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
	])("$label is preserved via ?? and does not warn", ({ value }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: value as any });
		expect(config.maxLlmCalls).toBe(value);
		expect(warn).not.toHaveBeenCalled();
	});

	it("Object(false) is preserved via ?? but warns (<= 0 path)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const boxed = Object(false);
		const config = new RunConfig({ maxLlmCalls: boxed as any });
		expect(config.maxLlmCalls).toBe(boxed);
		expect(warn).toHaveBeenCalled();
	});

	it('string "Infinity" maxLlmCalls stays unlimited in InvocationContext', () => {
		const ctx = makeCtx("Infinity");
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("Object(1) maxLlmCalls enforces on the second InvocationContext call", () => {
		const ctx = makeCtx(Object(1));
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("Object(false) maxLlmCalls stays unlimited (> 0 is false)", () => {
		const ctx = makeCtx(Object(false));
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});
});
