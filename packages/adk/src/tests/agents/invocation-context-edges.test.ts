import { describe, expect, it } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
	newInvocationContextId,
} from "../../agents/invocation-context";
import { RunConfig } from "../../agents/run-config";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(): Session {
	return {
		id: "session-edge",
		appName: "edge-app",
		userId: "edge-user",
		state: {},
		events: [],
	} as Session;
}

function makeContext(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
		...overrides,
	});
}

describe("InvocationContext leftover edges", () => {
	it("generates invocationId when omitted", () => {
		const context = makeContext();
		expect(context.invocationId).toMatch(/^e-/);
	});

	it("preserves explicit invocationId", () => {
		const context = makeContext({ invocationId: "inv-explicit" });
		expect(context.invocationId).toBe("inv-explicit");
	});

	it("newInvocationContextId returns unique e- prefixed ids", () => {
		const a = newInvocationContextId();
		const b = newInvocationContextId();
		expect(a).toMatch(/^e-/);
		expect(b).toMatch(/^e-/);
		expect(a).not.toBe(b);
	});

	it("defaults endInvocation to false when omitted", () => {
		const context = makeContext();
		expect(context.endInvocation).toBe(false);
	});

	it("defaults endInvocation to false when undefined", () => {
		const context = makeContext({ endInvocation: undefined });
		expect(context.endInvocation).toBe(false);
	});

	it("preserves explicit endInvocation true", () => {
		const context = makeContext({ endInvocation: true });
		expect(context.endInvocation).toBe(true);
	});

	it("propagates endInvocation to child contexts", () => {
		const parent = makeContext({ endInvocation: true });
		const child = parent.createChildContext(makeAgent("child"));
		expect(child.endInvocation).toBe(true);
	});

	it("incrementLlmCallCount allows exactly maxLlmCalls calls", () => {
		const context = makeContext({
			runConfig: new RunConfig({ maxLlmCalls: 2 }),
		});
		context.incrementLlmCallCount();
		context.incrementLlmCallCount();
		expect(() => context.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("incrementLlmCallCount throws LlmCallsLimitExceededError with limit in message", () => {
		const context = makeContext({
			runConfig: new RunConfig({ maxLlmCalls: 1 }),
		});
		context.incrementLlmCallCount();
		try {
			context.incrementLlmCallCount();
			expect.unreachable("should throw");
		} catch (error) {
			expect(error).toBeInstanceOf(LlmCallsLimitExceededError);
			expect((error as Error).name).toBe("LlmCallsLimitExceededError");
			expect((error as Error).message).toContain("`1`");
		}
	});

	it("incrementLlmCallCount does not enforce when runConfig is missing", () => {
		const context = makeContext();
		expect(() => {
			for (let i = 0; i < 10; i++) {
				context.incrementLlmCallCount();
			}
		}).not.toThrow();
	});

	it("incrementLlmCallCount does not enforce when maxLlmCalls is 0", () => {
		const context = makeContext({
			runConfig: new RunConfig({ maxLlmCalls: 0 }),
		});
		expect(() => {
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("incrementLlmCallCount does not enforce when maxLlmCalls is negative", () => {
		const context = makeContext({
			runConfig: new RunConfig({ maxLlmCalls: -10 }),
		});
		expect(() => {
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("shares invocationId and runConfig with child contexts", () => {
		const runConfig = new RunConfig({ maxLlmCalls: 5 });
		const parent = makeContext({
			invocationId: "shared-inv",
			runConfig,
			branch: "root",
		});
		const child = parent.createChildContext(makeAgent("worker"));

		expect(child.invocationId).toBe("shared-inv");
		expect(child.runConfig).toBe(runConfig);
		expect(child.branch).toBe("root.worker");
	});

	it("builds branch from agent name when parent branch is empty", () => {
		const parent = makeContext({ branch: undefined });
		const child = parent.createChildContext(makeAgent("solo"));
		expect(child.branch).toBe("solo");
	});
});
