import { describe, expect, it, vi } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";

function makeAgent(name = "agent"): BaseAgent {
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

function makeInvocation(
	options: { artifactService?: any; state?: Record<string, unknown> } = {},
) {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: makeAgent(),
		session: makeSession({ state: options.state ?? {} }),
		invocationId: "inv-1",
		artifactService: options.artifactService,
	});
}

describe("CallbackContext falsy eventActions / artifactService ninth leftover", () => {
	it.each([
		null,
		false,
		0,
		"",
		Number.NaN,
	] as const)("options.eventActions=%j is falsy via || so a fresh EventActions is allocated", (falsy) => {
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: falsy as any,
		});
		expect(ctx.eventActions).toBeInstanceOf(EventActions);
		expect(ctx.eventActions).not.toBe(falsy);
	});

	it("undefined eventActions (omit / explicit) also allocates fresh actions", () => {
		const a = new CallbackContext(makeInvocation());
		const b = new CallbackContext(makeInvocation(), {
			eventActions: undefined,
		});
		expect(a.eventActions).toBeInstanceOf(EventActions);
		expect(b.eventActions).toBeInstanceOf(EventActions);
		expect(a.eventActions).not.toBe(b.eventActions);
	});

	it("truthy EventActions is reused by reference", () => {
		const actions = new EventActions({ escalate: true });
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(ctx.eventActions).toBe(actions);
	});

	it("artifactService === null bypasses undefined check then TypeErrors on call", async () => {
		const ctx = new CallbackContext(makeInvocation({ artifactService: null }));
		await expect(ctx.loadArtifact("f.txt")).rejects.toThrow();
		await expect(ctx.saveArtifact("f.txt", { text: "x" })).rejects.toThrow();
	});

	it("artifactService === undefined still throws the dedicated init message", async () => {
		const ctx = new CallbackContext(makeInvocation());
		await expect(ctx.loadArtifact("f.txt")).rejects.toThrow(
			/Artifact service is not initialized/,
		);
		await expect(ctx.saveArtifact("f.txt", { text: "x" })).rejects.toThrow(
			/Artifact service is not initialized/,
		);
	});

	it("saveArtifact overwrites artifactDelta[filename] on re-save", async () => {
		const saveArtifact = vi
			.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(4);
		const ctx = new CallbackContext(
			makeInvocation({
				artifactService: { loadArtifact: vi.fn(), saveArtifact },
			}),
		);
		await ctx.saveArtifact("same.txt", { text: "a" });
		await ctx.saveArtifact("same.txt", { text: "b" });
		expect(ctx.eventActions.artifactDelta?.["same.txt"]).toBe(4);
		expect(Object.keys(ctx.eventActions.artifactDelta ?? {})).toEqual([
			"same.txt",
		]);
	});

	it("state mutations share the same stateDelta object as eventActions", () => {
		const actions = new EventActions();
		const ctx = new CallbackContext(makeInvocation({ state: { seed: 1 } }), {
			eventActions: actions,
		});
		ctx.state.flag = true;
		expect(actions.stateDelta).toBe(ctx.eventActions.stateDelta);
		expect(actions.stateDelta?.flag).toBe(true);
		expect(ctx.state.get("seed")).toBe(1);
	});

	it("loadArtifact/saveArtifact forward session.id from invocation, not a stale id", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "z" });
		const saveArtifact = vi.fn().mockResolvedValue(2);
		const inv = makeInvocation({
			artifactService: { loadArtifact, saveArtifact },
		});
		(inv.session as any).id = "live-session";
		const ctx = new CallbackContext(inv);
		await ctx.loadArtifact("a.txt");
		await ctx.saveArtifact("b.txt", { text: "b" });
		expect(loadArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ sessionId: "live-session" }),
		);
		expect(saveArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ sessionId: "live-session" }),
		);
	});
});
