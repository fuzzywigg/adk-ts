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

describe("ToolContext leftover edges", () => {
	it("listArtifacts forwards exact session identity fields", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["a.txt", "b.txt"]);
		const context = new ToolContext(
			makeInvocationContext({
				appName: "demo-app",
				userId: "u-9",
				session: { id: "sess-9", state: { x: 1 } } as any,
				artifactService: { listArtifactKeys } as any,
			}),
		);

		await expect(context.listArtifacts()).resolves.toEqual(["a.txt", "b.txt"]);
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "demo-app",
			userId: "u-9",
			sessionId: "sess-9",
		});
	});

	it("searchMemory forwards query with app and user identity", async () => {
		const searchMemory = vi.fn().mockResolvedValue({
			memories: [{ text: "hit" }],
		});
		const context = new ToolContext(
			makeInvocationContext({
				appName: "mem-app",
				userId: "mem-user",
				memoryService: { searchMemory } as any,
			}),
		);

		await expect(context.searchMemory("needle")).resolves.toEqual({
			memories: [{ text: "hit" }],
		});
		expect(searchMemory).toHaveBeenCalledWith({
			query: "needle",
			appName: "mem-app",
			userId: "mem-user",
		});
	});

	it("actions getter always returns the same EventActions instance", () => {
		const actions = new EventActions({ transferToAgent: "other" });
		const context = new ToolContext(makeInvocationContext(), {
			eventActions: actions,
		});
		expect(context.actions).toBe(actions);
		expect(context.actions).toBe(context.actions);
		expect(context.actions.transferToAgent).toBe("other");
	});

	it("allows functionCallId to be assigned after construction", () => {
		const context = new ToolContext(makeInvocationContext());
		expect(context.functionCallId).toBeUndefined();
		context.functionCallId = "assigned-later";
		expect(context.functionCallId).toBe("assigned-later");
	});

	it("propagates artifact service rejections from listArtifacts", async () => {
		const listArtifactKeys = vi.fn().mockRejectedValue(new Error("gcs down"));
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await expect(context.listArtifacts()).rejects.toThrow("gcs down");
	});

	it("propagates memory service rejections from searchMemory", async () => {
		const searchMemory = vi.fn().mockRejectedValue("memory offline");
		const context = new ToolContext(
			makeInvocationContext({
				memoryService: { searchMemory } as any,
			}),
		);
		await expect(context.searchMemory("q")).rejects.toBe("memory offline");
	});

	it("listArtifacts returns an empty array when the service has no keys", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue([]);
		const context = new ToolContext(
			makeInvocationContext({
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toEqual([]);
	});

	it("searchMemory can return empty memories payloads", async () => {
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = new ToolContext(
			makeInvocationContext({
				memoryService: { searchMemory } as any,
			}),
		);
		await expect(context.searchMemory("")).resolves.toEqual({ memories: [] });
	});

	it("constructs with both functionCallId and eventActions together", () => {
		const actions = new EventActions({ escalate: true });
		const context = new ToolContext(makeInvocationContext(), {
			functionCallId: "fc-combo",
			eventActions: actions,
		});
		expect(context.functionCallId).toBe("fc-combo");
		expect(context.actions.escalate).toBe(true);
	});
});
