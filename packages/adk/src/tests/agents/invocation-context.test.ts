import { describe, expect, it } from "vitest";
import {
	InvocationContext,
	LlmCallsLimitExceededError,
	newInvocationContextId,
} from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import { RunConfig } from "../../agents/run-config";
import type { BaseAgent } from "../../agents/base-agent";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: {},
		events: [],
	} as Session;
}

function makeContext(runConfig?: RunConfig): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("root"),
		session: makeSession(),
		runConfig,
	});
}

describe("InvocationContext", () => {
	it("creates invocation ids with e- prefix", () => {
		expect(newInvocationContextId()).toMatch(/^e-/);
	});

	it("exposes appName and userId from the session", () => {
		const context = makeContext();
		expect(context.appName).toBe("app");
		expect(context.userId).toBe("user-1");
	});

	it("enforces max llm call limits", () => {
		const context = makeContext(new RunConfig({ maxLlmCalls: 1 }));

		context.incrementLlmCallCount();
		expect(() => context.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("creates child contexts with updated branch and agent", () => {
		const parent = makeContext();
		const childAgent = makeAgent("child");
		const child = parent.createChildContext(childAgent);

		expect(child.agent).toBe(childAgent);
		expect(child.branch).toBe("child");
		expect(child.invocationId).toBe(parent.invocationId);
		expect(child.session).toBe(parent.session);

		const grandchild = child.createChildContext(makeAgent("grand"));
		expect(grandchild.branch).toBe("child.grand");
	});

	it("defaults endInvocation to false and preserves service accessors", () => {
		const sessionService = {} as BaseSessionService;
		const pluginManager = new PluginManager();
		const context = new InvocationContext({
			sessionService,
			pluginManager,
			agent: makeAgent("root"),
			session: makeSession(),
			branch: "root.branch",
		});

		expect(context.endInvocation).toBe(false);
		expect(context.sessionService).toBe(sessionService);
		expect(context.pluginManager).toBe(pluginManager);
		expect(context.branch).toBe("root.branch");

		context.endInvocation = true;
		expect(context.endInvocation).toBe(true);
	});

	it("treats non-positive maxLlmCalls as unlimited", () => {
		const context = makeContext(new RunConfig({ maxLlmCalls: 0 }));
		expect(() => {
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("propagates optional artifact and memory services to children", () => {
		const artifactService = { saveArtifact: async () => 1 } as any;
		const memoryService = { addMemory: async () => undefined } as any;
		const parent = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			artifactService,
			memoryService,
		});

		const child = parent.createChildContext(makeAgent("child"));
		expect(child.artifactService).toBe(artifactService);
		expect(child.memoryService).toBe(memoryService);
	});
});
