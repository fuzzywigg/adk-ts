import { describe, expect, it, vi } from "vitest";
import type { BaseAgent } from "../../agents/base-agent";
import { CallbackContext } from "../../agents/callback-context";
import { InvocationContext } from "../../agents/invocation-context";
import { ReadonlyContext } from "../../agents/readonly-context";
import { EventActions } from "../../events/event-actions";
import { PluginManager } from "../../plugins/plugin-manager";
import type { BaseSessionService } from "../../sessions/base-session-service";
import type { Session } from "../../sessions/session";
import { State } from "../../sessions/state";

function makeAgent(name = "agent"): BaseAgent {
	return { name } as BaseAgent;
}

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		id: "session-11",
		appName: "app-11",
		userId: "user-11",
		state: { seed: 1 },
		events: [],
		...overrides,
	} as Session;
}

function makeInvocation(
	options: {
		artifactService?: any;
		state?: Record<string, unknown>;
		userContent?: any;
		agent?: BaseAgent;
		session?: Session;
	} = {},
) {
	return new InvocationContext({
		sessionService: {} as BaseSessionService,
		pluginManager: new PluginManager(),
		agent: options.agent ?? makeAgent(),
		session:
			options.session ?? makeSession({ state: options.state ?? { seed: 1 } }),
		invocationId: "inv-11",
		artifactService: options.artifactService,
		userContent: options.userContent,
	});
}

/**
 * Eleventh leftover: loadArtifact forwards NaN/-0 versions; ReadonlyContext
 * getters track live invocation fields; State.create with missing stateDelta.
 */
describe("CallbackContext load version / readonly getters eleventh leftover", () => {
	it("loadArtifact forwards version NaN (not omitted as missing)", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "nan" });
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { loadArtifact } }),
		);
		await ctx.loadArtifact("a.txt", Number.NaN);
		expect(loadArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ filename: "a.txt", version: Number.NaN }),
		);
	});

	it("loadArtifact forwards version -0 without normalizing to +0", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "negzero" });
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { loadArtifact } }),
		);
		await ctx.loadArtifact("a.txt", -0);
		expect(Object.is(loadArtifact.mock.calls[0][0].version, -0)).toBe(true);
		expect(Object.is(loadArtifact.mock.calls[0][0].version, 0)).toBe(false);
	});

	it("loadArtifact/saveArtifact forward empty filename and empty session ids", async () => {
		const loadArtifact = vi.fn().mockResolvedValue(undefined);
		const saveArtifact = vi.fn().mockResolvedValue(3);
		const session = makeSession({
			id: "",
			appName: "",
			userId: "",
		});
		const ctx = new CallbackContext(
			makeInvocation({
				artifactService: { loadArtifact, saveArtifact },
				session,
			}),
		);
		await ctx.loadArtifact("");
		await ctx.saveArtifact("", { text: "x" });
		expect(loadArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				filename: "",
				appName: "",
				userId: "",
				sessionId: "",
			}),
		);
		expect(saveArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				filename: "",
				sessionId: "",
			}),
		);
		expect(ctx.eventActions.artifactDelta?.[""]).toBe(3);
	});

	it("ReadonlyContext getters follow live invocation agent/session mutations", () => {
		const inv = makeInvocation({
			userContent: { parts: [{ text: "hi" }] },
			agent: makeAgent("first"),
		});
		const ro = new ReadonlyContext(inv);
		const cb = new CallbackContext(inv);
		expect(ro.userContent).toEqual({ parts: [{ text: "hi" }] });
		expect(ro.invocationId).toBe("inv-11");
		expect(ro.agentName).toBe("first");
		expect(cb.agentName).toBe("first");
		expect(ro.appName).toBe("app-11");
		expect(ro.userId).toBe("user-11");
		expect(ro.sessionId).toBe("session-11");

		inv.agent = makeAgent("second");
		(inv.session as { id: string }).id = "mutated";
		expect(ro.agentName).toBe("second");
		expect(cb.agentName).toBe("second");
		expect(ro.sessionId).toBe("mutated");
		expect(cb.sessionId).toBe("mutated");
	});

	it("truthy eventActions without stateDelta still constructs; state reads throw", () => {
		const actions = { escalate: true } as any;
		const ctx = new CallbackContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(ctx.eventActions).toBe(actions);
		expect(ctx.state).toBeInstanceOf(State);
		expect(() => ctx.state.get("seed")).toThrow();
	});

	it("loadArtifact returns undefined from the service without coercing", async () => {
		const loadArtifact = vi.fn().mockResolvedValue(undefined);
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { loadArtifact } }),
		);
		await expect(ctx.loadArtifact("gone.txt")).resolves.toBeUndefined();
	});

	it("CallbackContext.userContent is the same ReadonlyContext pass-through", () => {
		const inv = makeInvocation({
			userContent: { role: "user", parts: [{ text: "q" }] },
		});
		expect(new CallbackContext(inv).userContent).toBe(inv.userContent);
		expect(new ReadonlyContext(inv).userContent).toBe(inv.userContent);
	});

	it("saveArtifact with EventActions that has a pre-seeded artifactDelta merges keys", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(8);
		const actions = new EventActions({
			artifactDelta: { "prior.txt": 1 },
		});
		const ctx = new CallbackContext(
			makeInvocation({ artifactService: { saveArtifact } }),
			{ eventActions: actions },
		);
		await ctx.saveArtifact("next.txt", { text: "n" });
		expect(ctx.eventActions.artifactDelta).toEqual({
			"prior.txt": 1,
			"next.txt": 8,
		});
	});
});
