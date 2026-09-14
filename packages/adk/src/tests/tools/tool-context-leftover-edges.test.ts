import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { State } from "../../sessions/state";
import { ToolContext } from "../../tools/tool-context";

function makeInvocation(
	overrides: Partial<InvocationContext> = {},
): InvocationContext {
	return {
		appName: "app",
		userId: "user-1",
		session: { id: "session-1", state: {} },
		artifactService: undefined,
		memoryService: undefined,
		...overrides,
	} as InvocationContext;
}

describe("ToolContext leftover: EventActions || defaults + auth configs", () => {
	it("creates fresh EventActions when options omit eventActions", () => {
		const context = new ToolContext(makeInvocation());
		expect(context.actions).toBeInstanceOf(EventActions);
		expect(context.actions.stateDelta).toEqual({});
		expect(context.actions.artifactDelta).toEqual({});
		expect(context.actions.requestedAuthConfigs).toBeUndefined();
	});

	it("preserves requestedAuthConfigs on provided EventActions", () => {
		const actions = new EventActions({
			requestedAuthConfigs: {
				"fc-1": { authScheme: { type: "http" } },
			},
			transferToAgent: "other",
			escalate: true,
		});
		const context = new ToolContext(makeInvocation(), {
			eventActions: actions,
			functionCallId: "fc-1",
		});
		expect(context.actions).toBe(actions);
		expect(context.actions.requestedAuthConfigs?.["fc-1"]).toEqual({
			authScheme: { type: "http" },
		});
		expect(context.functionCallId).toBe("fc-1");
		expect(context.actions.transferToAgent).toBe("other");
		expect(context.actions.escalate).toBe(true);
	});

	it("EventActions coalesces falsy stateDelta/artifactDelta to {}", () => {
		const cases = [undefined, null, false, 0, ""] as const;
		for (const falsy of cases) {
			const actions = new EventActions({
				stateDelta: falsy as any,
				artifactDelta: falsy as any,
			});
			expect(actions.stateDelta).toEqual({});
			expect(actions.artifactDelta).toEqual({});
		}
		const kept = new EventActions({
			stateDelta: { a: 1 },
			artifactDelta: { f: 2 },
		});
		expect(kept.stateDelta).toEqual({ a: 1 });
		expect(kept.artifactDelta).toEqual({ f: 2 });
	});

	it("mutates requestedAuthConfigs through actions for auth handoff", () => {
		const context = new ToolContext(makeInvocation(), {
			functionCallId: "call-9",
		});
		context.actions.requestedAuthConfigs = {
			"call-9": { scheme: "oauth2", scopes: ["read"] },
		};
		expect(context.eventActions.requestedAuthConfigs).toEqual({
			"call-9": { scheme: "oauth2", scopes: ["read"] },
		});
	});
});

describe("ToolContext leftover: state delta via CallbackContext", () => {
	it("state mutations land in eventActions.stateDelta", () => {
		const context = new ToolContext(
			makeInvocation({
				session: { id: "s", state: { existing: 1 } } as any,
			}),
		);
		context.state.existing = 2;
		context.state.fresh = "yes";
		expect(context.actions.stateDelta.existing).toBe(2);
		expect(context.actions.stateDelta.fresh).toBe("yes");
		expect(context.state.hasDelta()).toBe(true);
	});

	it("does not report delta when only reading existing state", () => {
		const context = new ToolContext(
			makeInvocation({
				session: { id: "s", state: { keep: "v" } } as any,
			}),
		);
		expect(context.state.keep).toBe("v");
		expect(context.state.hasDelta()).toBe(false);
		expect(context.actions.stateDelta).toEqual({});
	});

	it("shares the same State instance across repeated state getters", () => {
		const context = new ToolContext(makeInvocation());
		const a = context.state;
		const b = context.state;
		expect(a).toBe(b);
		expect(a).toBeInstanceOf(State);
	});
});

describe("ToolContext leftover: listArtifacts / searchMemory error + identity", () => {
	it("throws when artifactService is missing", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.listArtifacts()).rejects.toThrow(
			"Artifact service is not initialized.",
		);
	});

	it("throws when memoryService is missing", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.searchMemory("q")).rejects.toThrow(
			"Memory service is not available.",
		);
	});

	it("forwards exact identity fields for listArtifacts", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["a", "b"]);
		const context = new ToolContext(
			makeInvocation({
				appName: "demo",
				userId: "u-9",
				session: { id: "sess-9", state: {} } as any,
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toEqual(["a", "b"]);
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "demo",
			userId: "u-9",
			sessionId: "sess-9",
		});
	});

	it("forwards exact identity fields for searchMemory", async () => {
		const searchMemory = vi
			.fn()
			.mockResolvedValue({ memories: [{ text: "h" }] });
		const context = new ToolContext(
			makeInvocation({
				appName: "mem",
				userId: "mu",
				memoryService: { searchMemory } as any,
			}),
		);
		await expect(context.searchMemory("needle")).resolves.toEqual({
			memories: [{ text: "h" }],
		});
		expect(searchMemory).toHaveBeenCalledWith({
			query: "needle",
			appName: "mem",
			userId: "mu",
		});
	});

	it("propagates service rejections unchanged", async () => {
		await expect(
			new ToolContext(
				makeInvocation({
					artifactService: {
						listArtifactKeys: vi.fn().mockRejectedValue(new Error("gcs")),
					} as any,
				}),
			).listArtifacts(),
		).rejects.toThrow("gcs");
		await expect(
			new ToolContext(
				makeInvocation({
					memoryService: {
						searchMemory: vi.fn().mockRejectedValue("offline"),
					} as any,
				}),
			).searchMemory("q"),
		).rejects.toBe("offline");
	});

	it("returns empty artifacts and empty memories payloads", async () => {
		const context = new ToolContext(
			makeInvocation({
				artifactService: {
					listArtifactKeys: vi.fn().mockResolvedValue([]),
				} as any,
				memoryService: {
					searchMemory: vi.fn().mockResolvedValue({ memories: [] }),
				} as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toEqual([]);
		await expect(context.searchMemory("none")).resolves.toEqual({
			memories: [],
		});
	});
});

describe("ToolContext leftover: functionCallId + load/save artifact auth state", () => {
	it("allows undefined, empty, and reassignment of functionCallId", () => {
		const unset = new ToolContext(makeInvocation());
		expect(unset.functionCallId).toBeUndefined();
		unset.functionCallId = "later";
		expect(unset.functionCallId).toBe("later");

		const empty = new ToolContext(makeInvocation(), { functionCallId: "" });
		expect(empty.functionCallId).toBe("");
	});

	it("loadArtifact / saveArtifact throw without artifactService", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.loadArtifact("f.txt")).rejects.toThrow(
			"Artifact service is not initialized.",
		);
		await expect(
			context.saveArtifact("f.txt", { text: "x" } as any),
		).rejects.toThrow("Artifact service is not initialized.");
	});

	it("saveArtifact records artifactDelta version", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(4);
		const context = new ToolContext(
			makeInvocation({
				artifactService: {
					saveArtifact,
					loadArtifact: vi.fn(),
					listArtifactKeys: vi.fn(),
				} as any,
			}),
		);
		await expect(
			context.saveArtifact("note.txt", { text: "hi" } as any),
		).resolves.toBe(4);
		expect(context.actions.artifactDelta["note.txt"]).toBe(4);
		expect(saveArtifact).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			filename: "note.txt",
			artifact: { text: "hi" },
		});
	});

	it("loadArtifact forwards optional version", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "v2" });
		const context = new ToolContext(
			makeInvocation({
				artifactService: {
					loadArtifact,
					saveArtifact: vi.fn(),
					listArtifactKeys: vi.fn(),
				} as any,
			}),
		);
		await expect(context.loadArtifact("f.txt", 2)).resolves.toEqual({
			text: "v2",
		});
		expect(loadArtifact).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			filename: "f.txt",
			version: 2,
		});
	});

	it("actions getter aliases eventActions", () => {
		const actions = new EventActions({ skipSummarization: true });
		const context = new ToolContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(context.actions).toBe(context.eventActions);
		expect(context.actions.skipSummarization).toBe(true);
	});
});
