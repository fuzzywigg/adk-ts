import { describe, expect, it } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
} from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeInvocation(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): InvocationContext {
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
		...overrides,
	});
}

/**
 * Twenty-second leftover (HEAVY tip-relaunch residual after #251):
 * seventh pins falsy `runConfig &&` (`0`/`false`/`""`) and boolean
 * `maxLlmCalls: true`. Assert truthy sentinel `runConfig` values skip
 * without `maxLlmCalls`; SameValueZero `-0` skips; ±Infinity /
 * `"true"` maxLlmCalls asymmetries — residual after twentieth maxLlmCalls
 * tip / twenty-first endInvocation tip.
 */
describe("InvocationContext runConfig true/string-true/negzero twenty-second leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
		{ label: "empty-array", value: [] },
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
	])("truthy runConfig $label without maxLlmCalls skips enforcement", ({
		value,
	}) => {
		const ctx = makeInvocation({ runConfig: value as any });
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("SameValueZero -0 runConfig is falsy and skips enforcement", () => {
		const ctx = makeInvocation({ runConfig: -0 as any });
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it('maxLlmCalls "true" is not > 0 (ToNumber NaN) so unlimited', () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: "true" } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("maxLlmCalls POSITIVE_INFINITY is > 0 but counter never exceeds", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: Number.POSITIVE_INFINITY } as any,
		});
		for (let i = 0; i < 20; i++) {
			expect(() => ctx.incrementLlmCallCount()).not.toThrow();
		}
	});

	it("maxLlmCalls NEGATIVE_INFINITY is not > 0 so unlimited", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: Number.NEGATIVE_INFINITY } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("SameValueZero -0 maxLlmCalls is not > 0 so unlimited", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: -0 } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("boolean true maxLlmCalls still enforces on second call (seventh control)", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: true } as any,
		});
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});
});
