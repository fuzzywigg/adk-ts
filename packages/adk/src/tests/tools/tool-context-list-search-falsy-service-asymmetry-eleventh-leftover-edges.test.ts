import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
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

/**
 * Eleventh leftover: ToolContext.listArtifacts/searchMemory use truthy `!service`
 * while inherited CallbackContext.loadArtifact uses `=== undefined`. Falsy
 * non-undefined services (null/0/false/"") therefore throw the dedicated
 * list/search messages but TypeError on loadArtifact.
 */
describe("ToolContext list/search !service vs loadArtifact === undefined eleventh leftover", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
	] as const)("listArtifacts throws dedicated message when artifactService is $label", async ({
		value,
	}) => {
		const context = new ToolContext(
			makeInvocation({ artifactService: value as any }),
		);
		await expect(context.listArtifacts()).rejects.toThrow(
			"Artifact service is not initialized.",
		);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
	] as const)("searchMemory throws dedicated message when memoryService is $label", async ({
		value,
	}) => {
		const context = new ToolContext(
			makeInvocation({ memoryService: value as any }),
		);
		await expect(context.searchMemory("q")).rejects.toThrow(
			"Memory service is not available.",
		);
	});

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
	] as const)("loadArtifact TypeErrors (not dedicated message) when artifactService is $label", async ({
		value,
	}) => {
		const context = new ToolContext(
			makeInvocation({ artifactService: value as any }),
		);
		await expect(context.loadArtifact("a.txt")).rejects.toThrow(TypeError);
	});

	it("undefined artifactService still throws dedicated message on both list and load", async () => {
		const context = new ToolContext(makeInvocation());
		await expect(context.listArtifacts()).rejects.toThrow(
			"Artifact service is not initialized.",
		);
		await expect(context.loadArtifact("a.txt")).rejects.toThrow(
			"Artifact service is not initialized.",
		);
	});

	it("truthy artifactService still lists; truthy memoryService still searches", async () => {
		const listArtifactKeys = vi.fn().mockResolvedValue(["kept.txt"]);
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = new ToolContext(
			makeInvocation({
				artifactService: { listArtifactKeys } as any,
				memoryService: { searchMemory } as any,
			}),
		);
		await expect(context.listArtifacts()).resolves.toEqual(["kept.txt"]);
		await expect(context.searchMemory("q")).resolves.toEqual({ memories: [] });
	});
});
