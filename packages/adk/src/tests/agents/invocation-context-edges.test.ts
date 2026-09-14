import { describe, expect, it } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import {
	InvocationContext,
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
		appName: "app-edge",
		userId: "user-edge",
		state: {},
		events: [],
	} as Session;
}

describe("InvocationContext leftover edges (TOKENMAXX post #124)", () => {
	it("treats empty-string invocationId as falsy and generates e- prefixed id", () => {
		const context = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			invocationId: "",
		});

		expect(context.invocationId).toMatch(/^e-/);
		expect(context.invocationId).not.toBe("");
		expect(newInvocationContextId()).toMatch(/^e-/);
	});

	it("never enforces llm call limits when runConfig is undefined", () => {
		const context = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
		});

		expect(context.runConfig).toBeUndefined();
		expect(() => {
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
			context.incrementLlmCallCount();
		}).not.toThrow();
	});

	it("defaults omitted endInvocation to false via falsy coalesce", () => {
		const context = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			endInvocation: undefined,
		});
		expect(context.endInvocation).toBe(false);
	});

	it("createChildContext uses agent.name alone when parent branch is unset", () => {
		const parent = new InvocationContext({
			sessionService: {} as BaseSessionService,
			pluginManager: new PluginManager(),
			agent: makeAgent("root"),
			session: makeSession(),
			runConfig: new RunConfig({ maxLlmCalls: 2 }),
		});
		expect(parent.branch).toBeUndefined();

		const child = parent.createChildContext(makeAgent("worker"));
		expect(child.branch).toBe("worker");
		expect(child.runConfig).toBe(parent.runConfig);
	});
});
