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

	it("preserves custom invocation fields and live streaming state", () => {
		const liveRequestQueue = { close: () => undefined } as any;
		const activeStreamingTools = {
			stream_a: { name: "stream_a" },
		} as any;
		const transcriptionCache = [{ role: "user", data: "hi" }] as any;
		const userContent = { role: "user", parts: [{ text: "start" }] } as any;
		const runConfig = new RunConfig({ maxLlmCalls: 3 });

		const context = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			invocationId: "inv-custom",
			userContent,
			endInvocation: true,
			liveRequestQueue,
			activeStreamingTools,
			transcriptionCache,
			runConfig,
		});

		expect(context.invocationId).toBe("inv-custom");
		expect(context.userContent).toBe(userContent);
		expect(context.endInvocation).toBe(true);
		expect(context.liveRequestQueue).toBe(liveRequestQueue);
		expect(context.activeStreamingTools).toBe(activeStreamingTools);
		expect(context.transcriptionCache).toBe(transcriptionCache);
		expect(context.runConfig).toBe(runConfig);

		const child = context.createChildContext(makeAgent("worker"));
		expect(child.invocationId).toBe("inv-custom");
		expect(child.userContent).toBe(userContent);
		expect(child.endInvocation).toBe(true);
		expect(child.liveRequestQueue).toBe(liveRequestQueue);
		expect(child.activeStreamingTools).toBe(activeStreamingTools);
		expect(child.transcriptionCache).toBe(transcriptionCache);
		expect(child.runConfig).toBe(runConfig);
		expect(child.branch).toBe("worker");
	});

	it("exposes LlmCallsLimitExceededError name and message", () => {
		const context = makeContext(new RunConfig({ maxLlmCalls: 1 }));
		context.incrementLlmCallCount();

		try {
			context.incrementLlmCallCount();
			expect.unreachable("should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(LlmCallsLimitExceededError);
			expect((error as Error).name).toBe("LlmCallsLimitExceededError");
			expect((error as Error).message).toContain(
				"Max number of llm calls limit of `1` exceeded",
			);
		}
	});

	it("treats negative maxLlmCalls as unlimited", () => {
		const context = makeContext(new RunConfig({ maxLlmCalls: -5 }));
		expect(() => {
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("allows exactly maxLlmCalls increments and throws on the next", () => {
		const context = makeContext(new RunConfig({ maxLlmCalls: 2 }));
		expect(() => context.incrementLlmCallCount()).not.toThrow();
		expect(() => context.incrementLlmCallCount()).not.toThrow();
		expect(() => context.incrementLlmCallCount()).toThrow(
			/Max number of llm calls limit of `2` exceeded/,
		);
	});

	it("does not throw when incrementing without a runConfig", () => {
		const context = makeContext();
		expect(context.runConfig).toBeUndefined();
		expect(() => {
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("gives children an independent InvocationCostManager", () => {
		const parent = makeContext(new RunConfig({ maxLlmCalls: 1 }));
		parent.incrementLlmCallCount();
		expect(() => parent.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);

		const child = parent.createChildContext(makeAgent("child"));
		expect(() => child.incrementLlmCallCount()).not.toThrow();
		expect(() => child.incrementLlmCallCount()).toThrow(
			LlmCallsLimitExceededError,
		);
	});

	it("shares mutable streaming and transcription refs with children", () => {
		const activeStreamingTools = {
			stream_a: { name: "stream_a" },
		} as any;
		const transcriptionCache = [{ role: "user", data: "hi" }] as any;
		const parent = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			activeStreamingTools,
			transcriptionCache,
		});
		const child = parent.createChildContext(makeAgent("child"));

		expect(child.activeStreamingTools).toBe(parent.activeStreamingTools);
		expect(child.transcriptionCache).toBe(parent.transcriptionCache);

		parent.activeStreamingTools!.stream_b = { name: "stream_b" } as any;
		parent.transcriptionCache!.push({ role: "model", data: "yo" } as any);

		expect(child.activeStreamingTools).toHaveProperty("stream_b");
		expect(child.transcriptionCache).toHaveLength(2);
	});

	it("copies endInvocation by value at createChildContext time", () => {
		const parent = makeContext();
		expect(parent.endInvocation).toBe(false);
		const child = parent.createChildContext(makeAgent("child"));

		parent.endInvocation = true;
		expect(child.endInvocation).toBe(false);

		child.endInvocation = true;
		expect(parent.endInvocation).toBe(true);
		expect(child.endInvocation).toBe(true);
	});

	it("shares pluginManager and runConfig object identity with children", () => {
		const pluginManager = new PluginManager();
		const runConfig = new RunConfig({ maxLlmCalls: 9 });
		const parent = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager,
			agent: makeAgent("root"),
			session: makeSession(),
			runConfig,
		});
		const child = parent.createChildContext(makeAgent("child"));

		expect(child.pluginManager).toBe(pluginManager);
		expect(child.runConfig).toBe(runConfig);
	});

	it("generates distinct invocation ids when omitted", () => {
		const a = makeContext();
		const b = makeContext();
		expect(a.invocationId).toMatch(/^e-/);
		expect(b.invocationId).toMatch(/^e-/);
		expect(a.invocationId).not.toBe(b.invocationId);
	});
});
