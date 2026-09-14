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
 * Twentieth leftover: eighteenth pins `"false"` kept / no warn / unlimited.
 * Boolean `true` kept via ?? with no warn, but InvocationContext coerces to 1
 * and enforces on the second call. String `"true"` shares NaN unlimited with
 * `"false"`. `-0` / `-Infinity` / `[]` warn via `<= 0` then stay unlimited.
 */
describe("RunConfig maxLlmCalls boolean-true/string-true/negzero twentieth leftover", () => {
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

	it("boolean true is preserved via ?? and does not warn", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: true as any });
		expect(config.maxLlmCalls).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it("boolean true maxLlmCalls enforces on the second InvocationContext call", () => {
		const ctx = makeCtx(true);
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it('string "true" is preserved via ?? and does not warn', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "true" as any });
		expect(config.maxLlmCalls).toBe("true");
		expect(warn).not.toHaveBeenCalled();
	});

	it('InvocationContext treats maxLlmCalls "true" as unlimited (NaN path)', () => {
		const ctx = makeCtx("true");
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("SameValueZero -0 is preserved via ?? and warns (<= 0)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: -0 as any });
		expect(Object.is(config.maxLlmCalls, -0)).toBe(true);
		expect(warn).toHaveBeenCalled();
	});

	it("InvocationContext treats maxLlmCalls -0 as unlimited (-0 > 0 is false)", () => {
		const ctx = makeCtx(-0);
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("NEGATIVE_INFINITY is preserved via ?? and warns", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({
			maxLlmCalls: Number.NEGATIVE_INFINITY as any,
		});
		expect(config.maxLlmCalls).toBe(Number.NEGATIVE_INFINITY);
		expect(warn).toHaveBeenCalled();
	});

	it("empty-array maxLlmCalls is preserved via ?? and warns ([] <= 0)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const empty: never[] = [];
		const config = new RunConfig({ maxLlmCalls: empty as any });
		expect(config.maxLlmCalls).toBe(empty as any);
		expect(warn).toHaveBeenCalled();
	});

	it('string "false" still unlimited (eighteenth control asymmetry)', () => {
		const ctx = makeCtx("false");
		for (let i = 0; i < 3; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});
});
