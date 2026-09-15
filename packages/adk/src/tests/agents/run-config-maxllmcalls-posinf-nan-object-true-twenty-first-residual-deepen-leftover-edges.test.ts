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
 * Twenty-first leftover residual deepen (complements #246 twentieth
 * maxLlmCalls true/negzero/`-Infinity`): `??` preserve — POSITIVE_INFINITY /
 * `1` / `{}` / `Object(true)` no warn; `NaN` no warn (`NaN <= 0` false);
 * InvocationContext: POSITIVE_INFINITY unlimited; `1`/`Object(true)` enforce
 * on second call; `NaN`/`{}` unlimited.
 */
describe("RunConfig maxLlmCalls posinf/nan/object-true twenty-first residual deepen", () => {
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
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
		{ label: "NaN", value: Number.NaN },
	])("$label is preserved via ?? and does not warn", ({ value }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: value as any });
		if (Number.isNaN(value as any)) {
			expect(Number.isNaN(config.maxLlmCalls)).toBe(true);
		} else {
			expect(config.maxLlmCalls).toBe(value);
		}
		expect(warn).not.toHaveBeenCalled();
	});

	it("POSITIVE_INFINITY maxLlmCalls stays unlimited in InvocationContext", () => {
		const ctx = makeCtx(Number.POSITIVE_INFINITY);
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("number 1 maxLlmCalls enforces on the second InvocationContext call", () => {
		const ctx = makeCtx(1);
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("Object(true) maxLlmCalls enforces on the second call (ToNumber → 1)", () => {
		const ctx = makeCtx(Object(true));
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("NaN maxLlmCalls stays unlimited (NaN comparison path)", () => {
		const ctx = makeCtx(Number.NaN);
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("empty-object maxLlmCalls stays unlimited ({} comparison path)", () => {
		const ctx = makeCtx({});
		for (let i = 0; i < 5; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});
});
