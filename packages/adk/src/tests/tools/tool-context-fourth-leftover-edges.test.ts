import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
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

describe("ToolContext fourth leftover auth/state/artifact matrices", () => {
	it("constructs with functionCallId and default EventActions", () => {
		const context = new ToolContext(makeInvocation(), {
			functionCallId: "fc-4th",
		});
		expect(context.functionCallId).toBe("fc-4th");
		expect(context.actions).toBe(context.eventActions);
		expect(context.actions).toBeInstanceOf(EventActions);
	});

	it("state proxy reads session state and writes into stateDelta", () => {
		const actions = new EventActions();
		const context = new ToolContext(
			makeInvocation({
				session: { id: "s", state: { committed: 1 } } as any,
			}),
			{ eventActions: actions },
		);
		expect(context.state.get("committed")).toBe(1);
		context.state.set("pending", "yes");
		expect(context.state.get("pending")).toBe("yes");
		expect(actions.stateDelta.pending).toBe("yes");
		expect(context.state.hasDelta()).toBe(true);
	});

	it("state delta overrides committed value for get", () => {
		const actions = new EventActions({
			stateDelta: { theme: "dark" },
		});
		const context = new ToolContext(
			makeInvocation({
				session: { id: "s", state: { theme: "light" } } as any,
			}),
			{ eventActions: actions },
		);
		expect(context.state.get("theme")).toBe("dark");
		expect(context.state.toDict()).toEqual({ theme: "dark" });
	});

	it("proxy assignment mutates stateDelta", () => {
		const actions = new EventActions();
		const context = new ToolContext(makeInvocation(), {
			eventActions: actions,
		});
		context.state["user:locale"] = "en";
		expect(actions.stateDelta["user:locale"]).toBe("en");
		expect(context.state.get("user:locale")).toBe("en");
	});

	const artifactIdentity: Array<{
		label: string;
		appName: string;
		userId: string;
		sessionId: string;
		keys: string[];
	}> = [
		{
			label: "default ids",
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			keys: ["a.txt"],
		},
		{
			label: "custom ids",
			appName: "demo",
			userId: "u-9",
			sessionId: "sess-9",
			keys: ["x.bin", "y.json"],
		},
		{
			label: "empty list",
			appName: "empty-app",
			userId: "empty-user",
			sessionId: "empty-sess",
			keys: [],
		},
	];

	for (const row of artifactIdentity) {
		it(`listArtifacts forwards identity: ${row.label}`, async () => {
			const listArtifactKeys = vi.fn().mockResolvedValue(row.keys);
			const context = new ToolContext(
				makeInvocation({
					appName: row.appName,
					userId: row.userId,
					session: { id: row.sessionId, state: {} } as any,
					artifactService: { listArtifactKeys } as any,
				}),
			);
			await expect(context.listArtifacts()).resolves.toEqual(row.keys);
			expect(listArtifactKeys).toHaveBeenCalledWith({
				appName: row.appName,
				userId: row.userId,
				sessionId: row.sessionId,
			});
		});
	}

	it("loadArtifact forwards filename and optional version", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ text: "payload" });
		const context = new ToolContext(
			makeInvocation({
				appName: "art-app",
				userId: "art-user",
				session: { id: "art-sess", state: {} } as any,
				artifactService: { loadArtifact } as any,
			}),
		);
		await expect(context.loadArtifact("file.txt")).resolves.toEqual({
			text: "payload",
		});
		expect(loadArtifact).toHaveBeenCalledWith({
			appName: "art-app",
			userId: "art-user",
			sessionId: "art-sess",
			filename: "file.txt",
			version: undefined,
		});
		await context.loadArtifact("file.txt", 7);
		expect(loadArtifact).toHaveBeenLastCalledWith({
			appName: "art-app",
			userId: "art-user",
			sessionId: "art-sess",
			filename: "file.txt",
			version: 7,
		});
	});

	it("saveArtifact records version into artifactDelta", async () => {
		const saveArtifact = vi.fn().mockResolvedValue(4);
		const actions = new EventActions();
		const context = new ToolContext(
			makeInvocation({
				artifactService: { saveArtifact } as any,
			}),
			{ eventActions: actions },
		);
		await expect(
			context.saveArtifact("note.txt", { text: "hi" } as any),
		).resolves.toBe(4);
		expect(actions.artifactDelta["note.txt"]).toBe(4);
		expect(saveArtifact).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
			filename: "note.txt",
			artifact: { text: "hi" },
		});
	});

	it("saveArtifact overwrites prior artifactDelta for same filename", async () => {
		const saveArtifact = vi
			.fn()
			.mockResolvedValueOnce(1)
			.mockResolvedValueOnce(2);
		const actions = new EventActions();
		const context = new ToolContext(
			makeInvocation({
				artifactService: { saveArtifact } as any,
			}),
			{ eventActions: actions },
		);
		await context.saveArtifact("v.txt", { text: "a" } as any);
		await context.saveArtifact("v.txt", { text: "b" } as any);
		expect(actions.artifactDelta["v.txt"]).toBe(2);
	});

	const memoryQueries = ["", "needle", "東京", "  spaced  ", "multi word"];

	for (const query of memoryQueries) {
		it(`searchMemory forwards query ${JSON.stringify(query)}`, async () => {
			const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
			const context = new ToolContext(
				makeInvocation({
					appName: "mem-app",
					userId: "mem-user",
					memoryService: { searchMemory } as any,
				}),
			);
			await expect(context.searchMemory(query)).resolves.toEqual({
				memories: [],
			});
			expect(searchMemory).toHaveBeenCalledWith({
				query,
				appName: "mem-app",
				userId: "mem-user",
			});
		});
	}

	it("throws when artifactService missing for list/load/save", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.listArtifacts()).rejects.toThrow(
			"Artifact service is not initialized.",
		);
		await expect(context.loadArtifact("x")).rejects.toThrow(
			"Artifact service is not initialized.",
		);
		await expect(
			context.saveArtifact("x", { text: "y" } as any),
		).rejects.toThrow("Artifact service is not initialized.");
	});

	it("throws when memoryService missing", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.searchMemory("q")).rejects.toThrow(
			"Memory service is not available.",
		);
	});

	it("propagates listArtifacts and searchMemory rejections", async () => {
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

	it("actions getter returns same EventActions instance", () => {
		const actions = new EventActions({
			escalate: true,
			transferToAgent: "peer",
		});
		const context = new ToolContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(context.actions).toBe(actions);
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.transferToAgent).toBe("peer");
	});

	it("functionCallId can be reassigned including empty string", () => {
		const context = new ToolContext(makeInvocation(), {
			functionCallId: "start",
		});
		expect(context.functionCallId).toBe("start");
		context.functionCallId = "";
		expect(context.functionCallId).toBe("");
		context.functionCallId = "later";
		expect(context.functionCallId).toBe("later");
	});

	it("exposes invocationContext from parent", () => {
		const invocation = makeInvocation({ appName: "exposed" });
		const context = new ToolContext(invocation);
		expect(context.invocationContext.appName).toBe("exposed");
		expect(context.invocationContext).toBe(invocation);
	});

	it("loadArtifact returns undefined when service yields undefined", async () => {
		const context = new ToolContext(
			makeInvocation({
				artifactService: {
					loadArtifact: vi.fn().mockResolvedValue(undefined),
				} as any,
			}),
		);
		await expect(context.loadArtifact("missing")).resolves.toBeUndefined();
	});

	it("searchMemory returns service payload unchanged", async () => {
		const payload = {
			memories: [{ author: "a", content: { parts: [{ text: "t" }] } }],
		};
		const context = new ToolContext(
			makeInvocation({
				memoryService: {
					searchMemory: vi.fn().mockResolvedValue(payload),
				} as any,
			}),
		);
		await expect(context.searchMemory("t")).resolves.toEqual(payload);
	});
});
