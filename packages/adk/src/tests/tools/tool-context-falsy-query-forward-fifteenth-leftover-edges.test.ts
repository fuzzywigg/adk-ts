import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { ToolContext } from "../../tools/tool-context";

/**
 * Fifteenth leftover: searchMemory forwards query with no coalesce —
 * falsy queries are still passed through to memoryService.searchMemory.
 */
describe("tool-context falsy query forward fifteenth leftover", () => {
	it.each([
		{ label: "empty string", query: "" },
		{ label: "0", query: 0 },
		{ label: "false", query: false },
	] as const)("searchMemory forwards query=$label as-is", async ({ query }) => {
		const searchMemory = vi.fn().mockResolvedValue({ memories: [] });
		const context = new ToolContext({
			appName: "app",
			userId: "user-1",
			session: { id: "s1", state: {} },
			memoryService: { searchMemory },
		} as unknown as InvocationContext);

		await context.searchMemory(query as any);
		expect(searchMemory).toHaveBeenCalledWith({
			query,
			appName: "app",
			userId: "user-1",
		});
	});
});
