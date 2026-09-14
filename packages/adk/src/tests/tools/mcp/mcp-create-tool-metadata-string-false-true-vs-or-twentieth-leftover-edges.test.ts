import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover: adapter uses `metadata.isLongRunning ?? false` /
 * `shouldRetryOnFailure ?? false`, then BaseTool `|| false`.
 * String "false"/"true" survive ?? and stay truthy under || (unlike numeric 0).
 */
describe("mcp create-tool metadata string-false/true vs || twentieth leftover", () => {
	it.each([
		"false",
		"true",
	] as const)("isLongRunning: %j kept truthy via ?? then ||", async (value) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: `long_${value}`,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: value },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(value);
	});

	it.each([
		"false",
		"true",
	] as const)("shouldRetryOnFailure: %j kept truthy via ?? then ||", async (value) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: `retry_${value}`,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: value },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe(value);
	});

	it("boolean false still collapses via || (fourteenth control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bool_false_ctrl",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: false, shouldRetryOnFailure: false },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});
});
