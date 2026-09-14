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

describe("ToolContext leftover matrix edges", () => {
	it("listArtifacts forwards exact identity fields", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["a.txt", "b.txt"]);
		const context = new ToolContext(
			makeInvocation({
				appName: "demo",
				userId: "u-9",
				session: { id: "sess-9", state: {} } as any,
				artifactService: { listArtifactKeys } as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toEqual(["a.txt", "b.txt"]);
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "demo",
			userId: "u-9",
			sessionId: "sess-9",
		});
	});

	it("searchMemory forwards query with app and user identity", async () => {
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

	it("actions getter returns the same EventActions instance", () => {
		const actions = new EventActions({ transferToAgent: "other" });
		const context = new ToolContext(makeInvocation(), {
			eventActions: actions,
		});
		expect(context.actions).toBe(actions);
		expect(context.actions.transferToAgent).toBe("other");
	});

	it("allows functionCallId assignment after construction", () => {
		const context = new ToolContext(makeInvocation());
		expect(context.functionCallId).toBeUndefined();
		context.functionCallId = "later";
		expect(context.functionCallId).toBe("later");
	});

	it("propagates artifact and memory service rejections", async () => {
		const listArtifactKeys = vi.fn().mockRejectedValue(new Error("gcs down"));
		const searchMemory = vi.fn().mockRejectedValue("offline");
		await expect(
			new ToolContext(
				makeInvocation({ artifactService: { listArtifactKeys } as any }),
			).listArtifacts(),
		).rejects.toThrow("gcs down");
		await expect(
			new ToolContext(
				makeInvocation({ memoryService: { searchMemory } as any }),
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
		await expect(context.searchMemory("")).resolves.toEqual({ memories: [] });
	});

	it("throws when artifact or memory services are missing", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.listArtifacts()).rejects.toThrow(
			/Artifact service is not initialized/,
		);
		await expect(context.searchMemory("q")).rejects.toThrow(
			/Memory service is not available/,
		);
	});

	it("constructs with functionCallId and eventActions together", () => {
		const actions = new EventActions({ escalate: true });
		const context = new ToolContext(makeInvocation(), {
			functionCallId: "fc-1",
			eventActions: actions,
		});
		expect(context.functionCallId).toBe("fc-1");
		expect(context.actions.escalate).toBe(true);
	});
});
