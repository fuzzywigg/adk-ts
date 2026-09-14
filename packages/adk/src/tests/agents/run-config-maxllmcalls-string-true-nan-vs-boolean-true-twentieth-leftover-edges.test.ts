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

/**
 * Twentieth leftover: eighteenth pins `"false"` no-warn / unlimited. Residual
 * `"true"` same NaN path vs boolean `true` (ToNumber 1 → enforce). Empty array /
 * ±Infinity are additional enterers on `<= 0` / `> 0`.
 */
describe("RunConfig maxLlmCalls string-true NaN vs boolean-true twentieth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('string "true" is preserved via ?? and does not warn', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "true" as any });
		expect(config.maxLlmCalls).toBe("true");
		expect(warn).not.toHaveBeenCalled();
	});

	it('InvocationContext treats maxLlmCalls "true" as unlimited (NaN > 0 is false)', () => {
		const ctx = makeCtx("true");
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("boolean true is preserved and does not warn (1 <= 0 is false)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: true as any });
		expect(config.maxLlmCalls).toBe(true);
		expect(warn).not.toHaveBeenCalled();
	});

	it("InvocationContext boolean true enforces on the second call (seventh asymmetry)", () => {
		const ctx = makeCtx(true);
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("empty-array maxLlmCalls warns ([] <= 0) but stays unlimited in IC", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: [] as any });
		expect(config.maxLlmCalls).toEqual([]);
		expect(warn).toHaveBeenCalled();
		const ctx = makeCtx([]);
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("NEGATIVE_INFINITY maxLlmCalls warns and stays unlimited in IC", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({
			maxLlmCalls: Number.NEGATIVE_INFINITY as any,
		});
		expect(config.maxLlmCalls).toBe(Number.NEGATIVE_INFINITY);
		expect(warn).toHaveBeenCalled();
		const ctx = makeCtx(Number.NEGATIVE_INFINITY);
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("POSITIVE_INFINITY maxLlmCalls does not warn; IC never exceeds Infinity", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({
			maxLlmCalls: Number.POSITIVE_INFINITY as any,
		});
		expect(config.maxLlmCalls).toBe(Number.POSITIVE_INFINITY);
		expect(warn).not.toHaveBeenCalled();
		const ctx = makeCtx(Number.POSITIVE_INFINITY);
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it('string "false" still no-warn unlimited (eighteenth control)', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "false" as any });
		expect(config.maxLlmCalls).toBe("false");
		expect(warn).not.toHaveBeenCalled();
	});
});
