import { describe, expect, it, vi } from "vitest";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { PluginManager } from "../../plugins/plugin-manager";
import { EventActions } from "../../events/event-actions";
import type { BaseAgent } from "../../agents/base-agent";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";
import type { Part } from "@google/genai";

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
	options: { artifactService?: InvocationContext["artifactService"] } = {},
): InvocationContext {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent("agent"),
		session: makeSession({ existing: true }),
		invocationId: "inv-1",
		artifactService: options.artifactService,
	});
}

describe("CallbackContext", () => {
	it("tracks state mutations in the event actions delta", () => {
		const actions = new EventActions();
		const ctx = new CallbackContext(makeInvocationContext(), {
			eventActions: actions,
		});

		expect(ctx.state.get("existing")).toBe(true);
		ctx.state.set("foo", "bar");

		expect(ctx.state.get("foo")).toBe("bar");
		expect(actions.stateDelta).toEqual({ foo: "bar" });
		expect(ctx.state.hasDelta()).toBe(true);
	});

	it("loads artifacts through the artifact service", async () => {
		const artifact: Part = { text: "data" };
		const loadArtifact = vi.fn().mockResolvedValue(artifact);
		const ctx = new CallbackContext(
			makeInvocationContext({
				artifactService: { loadArtifact, saveArtifact: vi.fn() } as any,
			}),
		);

		await expect(ctx.loadArtifact("file.txt", 2)).resolves.toBe(artifact);
		expect(loadArtifact).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			filename: "file.txt",
			version: 2,
		});
	});

	it("saves artifacts and records artifactDelta", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(3);
		const artifact: Part = { text: "payload" };
		const ctx = new CallbackContext(
			makeInvocationContext({
				artifactService: { loadArtifact: vi.fn(), saveArtifact } as any,
			}),
		);

		await expect(ctx.saveArtifact("out.txt", artifact)).resolves.toBe(3);
		expect(saveArtifact).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			filename: "out.txt",
			artifact,
		});
		expect(ctx.eventActions.artifactDelta).toEqual({ "out.txt": 3 });
	});

	it("throws when artifact service is missing", async () => {
		const ctx = new CallbackContext(makeInvocationContext());

		await expect(ctx.loadArtifact("a.txt")).rejects.toThrow(
			"Artifact service is not initialized.",
		);
		await expect(ctx.saveArtifact("a.txt", { text: "x" })).rejects.toThrow(
			"Artifact service is not initialized.",
		);
	});

	it("exposes eventActions and invocationContext", () => {
		const actions = new EventActions({ escalate: true });
		const invocation = makeInvocationContext();
		const ctx = new CallbackContext(invocation, { eventActions: actions });

		expect(ctx.eventActions).toBe(actions);
		expect(ctx.invocationContext).toBe(invocation);
	});
});
