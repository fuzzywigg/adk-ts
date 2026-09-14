import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ToolContext } from "../../tools/tool-context";

/**
 * Fourteenth leftover: listArtifacts forwards session.id with no coalesce —
 * falsy ids are still passed through to listArtifactKeys.
 */
describe("tool-context falsy sessionId forward fourteenth leftover", () => {
	it.each([
		{ label: "empty string", id: "" },
		{ label: "0", id: 0 },
		{ label: "false", id: false },
	] as const)("listArtifacts forwards session.id=$label as-is", async ({
		id,
	}) => {
		const listArtifactKeys = vi.fn().mockResolvedValue([]);
		const context = new ToolContext({
			appName: "app",
			userId: "user-1",
			session: { id, state: {} },
			artifactService: { listArtifactKeys },
		} as unknown as InvocationContext);

		await context.listArtifacts();
		expect(listArtifactKeys).toHaveBeenCalledWith({
			appName: "app",
			userId: "user-1",
			sessionId: id,
		});
	});
});
