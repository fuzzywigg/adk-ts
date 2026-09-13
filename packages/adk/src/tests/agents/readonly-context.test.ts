import { describe, expect, it } from "vitest";
import { ReadonlyContext } from "../../agents/readonly-context";
import { InvocationContext } from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseAgent } from "../../agents/base-agent";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";
import type { Content } from "@google/genai";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(state: Record<string, unknown> = {}): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state,
		events: [],
	} as Session;
}

function makeInvocationContext(
	overrides: {
		userContent?: Content;
		state?: Record<string, unknown>;
		agentName?: string;
	} = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent(overrides.agentName ?? "agent"),
		session: makeSession(overrides.state),
		invocationId: "inv-123",
		userContent: overrides.userContent,
	});
}

describe("ReadonlyContext", () => {
	it("exposes userContent, invocationId, and agentName", () => {
		const userContent: Content = {
			role: "user",
			parts: [{ text: "hello" }],
		};
		const ctx = new ReadonlyContext(
			makeInvocationContext({ userContent, agentName: "researcher" }),
		);

		expect(ctx.userContent).toBe(userContent);
		expect(ctx.invocationId).toBe("inv-123");
		expect(ctx.agentName).toBe("researcher");
	});

	it("exposes appName, userId, and sessionId from the session", () => {
		const ctx = new ReadonlyContext(makeInvocationContext());

		expect(ctx.appName).toBe("app");
		expect(ctx.userId).toBe("user-1");
		expect(ctx.sessionId).toBe("session-1");
	});

	it("returns a frozen copy of session state", () => {
		const invocation = makeInvocationContext({ state: { foo: "bar" } });
		const ctx = new ReadonlyContext(invocation);

		expect(ctx.state).toEqual({ foo: "bar" });
		expect(Object.isFrozen(ctx.state)).toBe(true);
		expect(() => {
			(ctx.state as Record<string, unknown>).foo = "mutated";
		}).toThrow();
		expect(invocation.session.state.foo).toBe("bar");
	});
});
