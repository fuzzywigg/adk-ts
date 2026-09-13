import { describe, expect, it, vi } from "vitest";
import { ToolContext } from "../../tools/tool-context";
import { EventActions } from "../../events/event-actions";
import type { InvocationContext } from "../../agents/invocation-context";

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
});
