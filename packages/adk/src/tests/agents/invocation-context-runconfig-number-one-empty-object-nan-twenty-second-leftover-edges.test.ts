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
 * Twenty-second leftover (HEAVY residual complement after open #265
 * runConfig tip): Assert number `1` / `{}` runConfig without maxLlmCalls
 * skip; `NaN` runConfig skips; maxLlmCalls `1` enforces; maxLlmCalls `{}` /
 * `NaN` are not `> 0` so unlimited.
 */
describe("InvocationContext runConfig number-one/empty-object/NaN twenty-second leftover", () => {
	it.each([
		{ label: "number 1", value: 1 },
		{ label: "empty-object", value: {} },
		{ label: "NaN", value: Number.NaN },
	])("runConfig $label without maxLlmCalls skips enforcement", ({ value }) => {
		const ctx = makeInvocation({ runConfig: value as any });
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("maxLlmCalls number 1 enforces on second call", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: 1 } as any,
		});
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("maxLlmCalls empty-object is not > 0 (ToNumber NaN) so unlimited", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: {} } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("maxLlmCalls NaN is not > 0 so unlimited", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: Number.NaN } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});
});
