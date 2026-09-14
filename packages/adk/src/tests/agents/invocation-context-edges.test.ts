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

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
		...overrides,
	} as Session;
}

function baseOptions(
	overrides: Partial<ConstructorParameters<typeof InvocationContext>[0]> = {},
) {
	return {
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
		...overrides,
	};
}

describe("InvocationContext leftover edges", () => {
	it("generates unique invocation ids with e- prefix", () => {
		const a = newInvocationContextId();
		const b = newInvocationContextId();
		expect(a).toMatch(/^e-/);
		expect(b).toMatch(/^e-/);
		expect(a).not.toBe(b);
	});

	it("auto-assigns invocationId when omitted", () => {
		const context = new InvocationContext(baseOptions());
		expect(context.invocationId).toMatch(/^e-/);
	});

	it("treats empty-string invocationId as missing via || fallback", () => {
		const context = new InvocationContext(baseOptions({ invocationId: "" }));
		expect(context.invocationId).toMatch(/^e-/);
		expect(context.invocationId.length).toBeGreaterThan(2);
	});

	it("allows unlimited llm calls when runConfig is omitted", () => {
		const context = new InvocationContext(baseOptions());
		expect(context.runConfig).toBeUndefined();
		expect(() => {
			for (let i = 0; i < 5; i++) {
				context.incrementLlmCallCount();
			}
		}).not.toThrow();
	});

	it("enforces the limit only after exceeding maxLlmCalls", () => {
		const context = new InvocationContext(
			baseOptions({ runConfig: new RunConfig({ maxLlmCalls: 2 }) }),
		);

		expect(() => context.incrementLlmCallCount()).not.toThrow();
		expect(() => context.incrementLlmCallCount()).not.toThrow();
		expect(() => context.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("shares the same pluginManager instance with children", () => {
		const pluginManager = new PluginManager();
		const parent = new InvocationContext(baseOptions({ pluginManager }));
		const child = parent.createChildContext(makeAgent("child"));

		expect(child.pluginManager).toBe(pluginManager);
		expect(child.pluginManager).toBe(parent.pluginManager);
	});

	it("starts child branch from agent name when parent branch is undefined", () => {
		const parent = new InvocationContext(baseOptions());
		expect(parent.branch).toBeUndefined();

		const child = parent.createChildContext(makeAgent("leaf"));
		expect(child.branch).toBe("leaf");
	});

	it("nests branch paths across multiple createChildContext calls", () => {
		const root = new InvocationContext(baseOptions({ branch: "orchestrator" }));
		const mid = root.createChildContext(makeAgent("planner"));
		const leaf = mid.createChildContext(makeAgent("worker"));

		expect(mid.branch).toBe("orchestrator.planner");
		expect(leaf.branch).toBe("orchestrator.planner.worker");
		expect(leaf.invocationId).toBe(root.invocationId);
		expect(leaf.agent.name).toBe("worker");
	});

	it("reflects session appName/userId getters after construction", () => {
		const context = new InvocationContext(
			baseOptions({
				session: makeSession({ appName: "demo-app", userId: "u-9" }),
			}),
		);

		expect(context.appName).toBe("demo-app");
		expect(context.userId).toBe("u-9");
	});

	it("coerces omitted endInvocation to false and preserves explicit true on children", () => {
		const parent = new InvocationContext(
			baseOptions({ endInvocation: undefined }),
		);
		expect(parent.endInvocation).toBe(false);

		parent.endInvocation = true;
		const child = parent.createChildContext(makeAgent("child"));
		expect(child.endInvocation).toBe(true);
	});

	it("leaves optional live fields undefined when not provided", () => {
		const context = new InvocationContext(baseOptions());

		expect(context.artifactService).toBeUndefined();
		expect(context.memoryService).toBeUndefined();
		expect(context.userContent).toBeUndefined();
		expect(context.liveRequestQueue).toBeUndefined();
		expect(context.activeStreamingTools).toBeUndefined();
		expect(context.transcriptionCache).toBeUndefined();
	});

	it("exposes LlmCallsLimitExceededError as a named Error subclass", () => {
		const err = new LlmCallsLimitExceededError("boom");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(LlmCallsLimitExceededError);
		expect(err.name).toBe("LlmCallsLimitExceededError");
		expect(err.message).toBe("boom");
	});
});
