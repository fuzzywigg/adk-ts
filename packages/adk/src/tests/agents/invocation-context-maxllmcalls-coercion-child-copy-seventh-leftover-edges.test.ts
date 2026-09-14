import { describe, expect, it } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
} from "../../agents/invocation-context";
import { LiveRequestQueue } from "../../agents/live-request-queue";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeInvocation(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
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
 * Seventh leftover: incrementLlmCallCount coercions on maxLlmCalls,
 * falsy runConfig short-circuit, createChild copies refs and re-applies || on endInvocation.
 */
describe("InvocationContext maxLlmCalls coercion / child copy seventh leftover", () => {
	it("falsy runConfig (0 / false / '') skips enforcement via runConfig &&", () => {
		for (const runConfig of [0, false, ""] as const) {
			const ctx = makeInvocation({ runConfig: runConfig as any });
			expect(() => {
				ctx.incrementLlmCallCount();
				ctx.incrementLlmCallCount();
			}).not.toThrow();
		}
	});

	it("empty runConfig object has undefined maxLlmCalls so undefined > 0 is false", () => {
		const ctx = makeInvocation({ runConfig: {} as any });
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it('string maxLlmCalls "0" is not > 0 so unlimited', () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: "0" } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it('string maxLlmCalls "1" coerces: second call exceeds', () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: "1" } as any,
		});
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("boolean true maxLlmCalls coerces to 1 (> 0) and enforces on the second call", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: true } as any,
		});
		ctx.incrementLlmCallCount();
		expect(() => ctx.incrementLlmCallCount()).toThrow(
			/Max number of llm calls limit of `true` exceeded/,
		);
	});

	it("NaN maxLlmCalls: NaN > 0 is false so unlimited", () => {
		const ctx = makeInvocation({
			runConfig: { maxLlmCalls: Number.NaN } as any,
		});
		expect(() => {
			ctx.incrementLlmCallCount();
			ctx.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("parent branch '0' is truthy so child nests as 0.leaf", () => {
		const parent = makeInvocation({ branch: "0" as any });
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.branch).toBe("0.leaf");
	});

	it("createChild re-applies endInvocation || false so parent '' becomes false on child", () => {
		const parent = makeInvocation({ endInvocation: true });
		parent.endInvocation = "" as any;
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.endInvocation).toBe(false);
	});

	it("createChild preserves truthy non-boolean parent endInvocation", () => {
		const parent = makeInvocation();
		parent.endInvocation = "yes" as any;
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.endInvocation).toBe("yes");
	});

	it("createChild copies liveRequestQueue and activeStreamingTools by reference", () => {
		const queue = new LiveRequestQueue();
		const tools = { t: { stream: queue } } as any;
		const parent = makeInvocation({
			liveRequestQueue: queue,
			activeStreamingTools: tools,
			transcriptionCache: [] as any,
		});
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.liveRequestQueue).toBe(queue);
		expect(child.activeStreamingTools).toBe(tools);
		expect(child.transcriptionCache).toBe(parent.transcriptionCache);
		expect(child.pluginManager).toBe(parent.pluginManager);
		expect(child.session).toBe(parent.session);
		expect(child.sessionService).toBe(parent.sessionService);
	});

	it("appName/userId getters return empty session strings as-is", () => {
		const ctx = makeInvocation({
			session: {
				id: "s",
				appName: "",
				userId: "",
				state: {},
				events: [],
			} as Session,
		});
		expect(ctx.appName).toBe("");
		expect(ctx.userId).toBe("");
	});

	it("child keeps the same invocationId even when it is whitespace", () => {
		const parent = makeInvocation({ invocationId: "   " });
		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.invocationId).toBe("   ");
	});
});
