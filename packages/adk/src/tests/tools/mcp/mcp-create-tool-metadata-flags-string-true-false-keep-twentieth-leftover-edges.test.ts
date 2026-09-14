import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover: adapter `metadata.isLongRunning ?? false` /
 * `shouldRetryOnFailure ?? false` / `maxRetryAttempts ?? 3` then BaseTool
 * `||` — string `"true"`/`"false"` survive both (fourteenth pinned numeric 0
 * coerce; nineteenth base-tool pinned flags on BaseTool directly).
 */
describe("mcp create-tool metadata flags string-true/false keep twentieth leftover", () => {
	it.each([
		"true",
		"false",
	] as const)("isLongRunning: %j kept via ?? then ||", async (isLongRunning) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: `long_${isLongRunning}`,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(isLongRunning);
	});

	it.each([
		"true",
		"false",
	] as const)("shouldRetryOnFailure: %j kept via ?? then ||", async (shouldRetryOnFailure) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: `retry_${shouldRetryOnFailure}`,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe(shouldRetryOnFailure);
	});

	it.each([
		"true",
		"false",
	] as const)("maxRetryAttempts: %j kept via ?? then ||", async (maxRetryAttempts) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: `max_${maxRetryAttempts}`,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(maxRetryAttempts);
	});

	it("boolean true isLongRunning still kept (fourteenth control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "long_bool_true",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: true },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(true);
	});
});
