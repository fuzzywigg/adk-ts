import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { EventActions } from "../../events/event-actions";
import { ToolContext } from "../../tools/tool-context";

function makeInvocationContext(
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

describe("ToolContext", () => {
	it("exposes event actions and functionCallId", () => {
		const actions = new EventActions({ escalate: true });
		const context = new ToolContext(makeInvocationContext(), {
			functionCallId: "call-1",
			eventActions: actions,
		});

		expect(context.functionCallId).toBe("call-1");
		expect(context.actions).toBe(actions);
		expect(context.actions.escalate).toBe(true);
	});

	it("lists artifacts through the artifact service", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["a.txt"]);
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: { listArtifactKeys } as any,
			}),
		);

		await expect(context.listArtifacts()).resolves.toEqual(["a.txt"]);
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "session-1",
		});
	});

	it("throws when artifact or memory services are missing", async () => {
		const context = new ToolContext(makeInvocationContext());

		await expect(context.listArtifacts()).rejects.toThrow(
			"Artifact service is not initialized.",
		);
		await expect(context.searchMemory("q")).rejects.toThrow(
			"Memory service is not available.",
		);
	});

	it("searches memory through the memory service", async () => {
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = new ToolContext(
			makeInvocationContext({
				memoryService: { searchMemory } as any,
			}),
		);

		await expect(context.searchMemory("hello")).resolves.toEqual({
			memories: [],
		});
		expect(searchMemory).toHaveBeenCalledWith({
			query: "hello",
			appName: "app",
			userId: "user-1",
		});
	});

	it("defaults functionCallId and creates default EventActions when omitted", () => {
		const context = new ToolContext(makeInvocationContext());
		expect(context.functionCallId).toBeUndefined();
		expect(context.actions).toBeDefined();
		expect(context.actions).toBe(context.eventActions);
	});

	it("forwards empty artifact lists and memory hits unchanged", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue([]);
		const searchMemory = vi
			.fn()
			.mockResolvedValue({ memories: [{ text: "hit" }] });
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: { listArtifactKeys } as any,
				memoryService: { searchMemory } as any,
			}),
		);

		await expect(context.listArtifacts()).resolves.toEqual([]);
		await expect(context.searchMemory("q")).resolves.toEqual({
			memories: [{ text: "hit" }],
		});
	});

	it("propagates artifact and memory service failures", async () => {
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: {
					listArtifactKeys: vi.fn().mockRejectedValue(new Error("gcs down")),
				} as any,
				memoryService: {
					searchMemory: vi.fn().mockRejectedValue(new Error("rag down")),
				} as any,
			}),
		);

		await expect(context.listArtifacts()).rejects.toThrow("gcs down");
		await expect(context.searchMemory("q")).rejects.toThrow("rag down");
	});

	it("uses session.id from the invocation context for listArtifacts", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["x"]);
		const context = new ToolContext(
			makeInvocationContext({
				session: { id: "custom-session", state: {} } as any,
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await context.listArtifacts();
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: "custom-session",
		});
	});

	it("exposes the same eventActions instance through actions getter", () => {
		const actions = new EventActions({ transferToAgent: "other" });
		const context = new ToolContext(makeInvocationContext(), {
			eventActions: actions,
		});
		expect(context.actions).toBe(context.eventActions);
		expect(context.actions.transferToAgent).toBe("other");
	});

	it("forwards appName and userId overrides into artifact listing", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["z"]);
		const context = new ToolContext(
			makeInvocationContext({
				appName: "other-app",
				userId: "user-9",
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await context.listArtifacts();
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "other-app",
			userId: "user-9",
			sessionId: "session-1",
		});
	});

	it("forwards appName and userId overrides into memory search", async () => {
		const searchMemory = vi.fn().mockResolvedValue({ memories: ["m"] });
		const context = new ToolContext(
			makeInvocationContext({
				appName: "mem-app",
				userId: "mem-user",
				memoryService: { searchMemory } as any,
			}),
		);
		await expect(context.searchMemory("needle")).resolves.toEqual({
			memories: ["m"],
		});
		expect(searchMemory).toHaveBeenCalledWith({
			query: "needle",
			appName: "mem-app",
			userId: "mem-user",
		});
	});

	it("allows functionCallId to be set to an empty string", () => {
		const context = new ToolContext(makeInvocationContext(), {
			functionCallId: "",
		});
		expect(context.functionCallId).toBe("");
	});

	it("inherits CallbackContext artifact helpers when artifactService is present", async () => {
		const loadArtifact = vi.fn().mockResolvedValue({ data: "bytes" });
		const saveArtifact = vi.fn().mockResolvedValue(3);
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: {
					loadArtifact,
					saveArtifact,
					listArtifactKeys: vi.fn(),
				} as any,
			}),
		);

		await expect(context.loadArtifact("file.txt")).resolves.toEqual({
			data: "bytes",
		});
		await expect(
			context.saveArtifact("file.txt", { data: "x" } as any),
		).resolves.toBe(3);
		expect(context.eventActions.artifactDelta["file.txt"]).toBe(3);
	});

	it("throws from inherited loadArtifact when artifactService is missing", async () => {
		const context = new ToolContext(makeInvocationContext());
		await expect(context.loadArtifact("missing.txt")).rejects.toThrow(
			/Artifact service is not initialized/,
		);
	});

	it("throws from inherited saveArtifact when artifactService is missing", async () => {
		const context = new ToolContext(makeInvocationContext());
		await expect(
			context.saveArtifact("missing.txt", { data: "x" } as any),
		).rejects.toThrow(/Artifact service is not initialized/);
	});

	it("searchMemory propagates empty-string queries to the memory service", async () => {
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = new ToolContext(
			makeInvocationContext({
				memoryService: { searchMemory } as any,
			}),
		);
		await context.searchMemory("");
		expect(searchMemory).toHaveBeenCalledWith({
			query: "",
			appName: "app",
			userId: "user-1",
		});
	});

	it("listArtifacts can return multiple keys in service order", async () => {
		const listArtifactKeys = vi
			.fn()
			.mockResolvedValue(["b.txt", "a.txt", "c.txt"]);
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toEqual([
			"b.txt",
			"a.txt",
			"c.txt",
		]);
	});
});
