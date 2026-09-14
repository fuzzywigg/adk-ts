import { describe, expect, it, vi } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";
import { State } from "../../sessions/state";

function makeAgent(name = "agent"): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-1",
		appName: "app",
		userId: "user-1",
		state: { seed: 1 },
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
		session: makeSession({ state: options.state ?? { seed: 1 } }),
		invocationId: "inv-1",
		artifactService: options.artifactService,
	});
}

/**
 * Tenth leftover: CallbackContext overrides frozen ReadonlyContext.state;
 * loadArtifact forwards version 0 vs undefined; null service results pass through.
 */
describe("CallbackContext version-forward / state freeze tenth leftover", () => {
	it("CallbackContext.state is a writable State, not a frozen snapshot", () => {
		const inv = makeInvocation();
		const ro = new ReadonlyContext(inv);
		const cb = new CallbackContext(inv);
		expect(Object.isFrozen(ro.state)).toBe(true);
		expect(() => {
			(ro.state as any).nope = true;
		}).toThrow();
		expect(cb.state).toBeInstanceOf(State);
		cb.state.flag = "on";
		expect(cb.state.get("flag")).toBe("on");
		expect(cb.eventActions.stateDelta?.flag).toBe("on");
	});

	it("ReadonlyContext.state snapshot does not see later CallbackContext mutations", () => {
		const inv = makeInvocation();
		const ro = new ReadonlyContext(inv);
		const before = ro.state;
		const cb = new CallbackContext(inv);
		cb.state.extra = 9;
		expect(before).not.toHaveProperty("extra");
		expect(inv.session.state.extra).toBe(9);
		expect(new ReadonlyContext(inv).state.extra).toBe(9);
	});

	it("loadArtifact forwards version 0 (does not treat as missing)", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "v0" });
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { loadArtifact } }),
		);
		await expect(ctx.loadArtifact("a.txt", 0)).resolves.toEqual({ text: "v0" });
		expect(loadArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ filename: "a.txt", version: 0 }),
		);
	});

	it("loadArtifact omits version when undefined so service can pick latest", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "latest" });
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { loadArtifact } }),
		);
		await ctx.loadArtifact("a.txt");
		expect(loadArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ version: undefined }),
		);
	});

	it("loadArtifact returns service null as-is (does not coerce to undefined)", async () => {
		const loadArtifact = vi.fn().mockResolvedValue(null);
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { loadArtifact } }),
		);
		await expect(ctx.loadArtifact("missing.txt")).resolves.toBeNull();
	});

	it("saveArtifact records version 0 in artifactDelta", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(0);
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { saveArtifact } }),
		);
		await expect(ctx.saveArtifact("z.txt", { text: "z" })).resolves.toBe(0);
		expect(ctx.eventActions.artifactDelta?.["z.txt"]).toBe(0);
	});

	it("saveArtifact throws when a truthy non-EventActions object lacks artifactDelta", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(1);
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { saveArtifact } }),
			{ eventActions: { stateDelta: {} } as any },
		);
		await expect(ctx.saveArtifact("z.txt", { text: "z" })).rejects.toThrow();
	});

	it("invocationContext getter returns the same InvocationContext instance", () => {
		const inv = makeInvocation();
		const ctx = new CallbackContext(inv);
		expect(ctx.invocationContext).toBe(inv);
	});
});
