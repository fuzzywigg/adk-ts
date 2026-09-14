import { describe, expect, it, vi } from "vitest";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseAgent } from "../../agents/base-agent";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";
import type { Part } from "@google/genai";

function makeAgent(name: string): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(state: Record<string, unknown> = {}): Session {
	return {
		id: "session-cb",
		appName: "cb-app",
		userId: "cb-user",
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
		agent: makeAgent("cb_agent"),
		session: makeSession(),
		invocationId: "inv-cb",
		artifactService: options.artifactService,
	});
}

describe("CallbackContext leftover edges", () => {
	it("creates default EventActions when eventActions is omitted", () => {
		const ctx = new CallbackContext(makeInvocationContext());
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions.stateDelta).toEqual({});
		expect(ctx.eventActions.artifactDelta).toEqual({});
	});

	it("creates default EventActions when eventActions is undefined", () => {
		const ctx = new CallbackContext(makeInvocationContext(), {
			eventActions: undefined,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
	});

	it("uses provided EventActions when passed", () => {
		const actions = new EventActions({ escalate: true });
		const ctx = new CallbackContext(makeInvocationContext(), {
			eventActions: actions,
		});
		expect(ctx.eventActions).toBe(actions);
		expect(ctx.eventActions.escalate).toBe(true);
	});

	it("throws when artifact service is missing on loadArtifact", async () => {
		const ctx = new CallbackContext(makeInvocationContext());
		await expect(ctx.loadArtifact("missing.txt")).rejects.toThrow(
			"Artifact service is not initialized.",
		);
	});

	it("throws when artifact service is missing on saveArtifact", async () => {
		const ctx = new CallbackContext(makeInvocationContext());
		await expect(
			ctx.saveArtifact("missing.txt", { text: "x" }),
		).rejects.toThrow("Artifact service is not initialized.");
	});

	it("loadArtifact delegates to artifact service when present", async () => {
		const artifact: Part = { text: "loaded" };
		const loadArtifact = vi.fn().mockResolvedValue(artifact);
		const ctx = new CallbackContext(
			makeInvocationContext({
				artifactService: { loadArtifact, saveArtifact: vi.fn() } as any,
			}),
		);

		await expect(ctx.loadArtifact("file.bin", 1)).resolves.toBe(artifact);
		expect(loadArtifact).toHaveBeenCalledWith({
			appName: "cb-app",
			userId: "cb-user",
			sessionId: "session-cb",
			filename: "file.bin",
			version: 1,
		});
	});

	it("saveArtifact records artifactDelta on the event actions", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(7);
		const ctx = new CallbackContext(
			makeInvocationContext({
				artifactService: { loadArtifact: vi.fn(), saveArtifact } as any,
			}),
		);

		await expect(ctx.saveArtifact("out.bin", { text: "data" })).resolves.toBe(
			7,
		);
		expect(ctx.eventActions.artifactDelta).toEqual({ "out.bin": 7 });
	});

	it("creates independent EventActions per CallbackContext instance", () => {
		const invocation = makeInvocationContext();
		const ctxA = new CallbackContext(invocation);
		const ctxB = new CallbackContext(invocation);

		ctxA.state.set("only_a", 1);
		expect(ctxA.eventActions).not.toBe(ctxB.eventActions);
		expect(ctxA.eventActions.stateDelta).toEqual({ only_a: 1 });
		expect(ctxB.eventActions.stateDelta).toEqual({});
	});
});
