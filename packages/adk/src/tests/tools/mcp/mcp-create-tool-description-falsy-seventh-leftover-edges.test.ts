import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

describe("MCP create-tool description/maxRetry falsy seventh leftover (post #158)", () => {
	it.each([
		{ label: '""', description: "" },
		{ label: "null", description: null },
		{ label: "undefined", description: undefined },
		{ label: "0", description: 0 },
		{ label: "false", description: false },
	] as const)("coalesces falsy description ($label) to 'MCP Tool' via || before BaseTool length check", async ({
		description,
	}) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "falsy_desc",
				description: description as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("MCP Tool");
	});

	it("keeps whitespace-only description (truthy) which then fails BaseTool min-length 3", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "ws_desc",
					description: "  ",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/too short|Failed to create tool/);
	});

	it("maxRetryAttempts:0 survives ?? but BaseTool || 3 coerces it to 3", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "zero_retry",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: 0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("maxRetryAttempts:null via ?? becomes 3 before BaseTool", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "null_retry",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: null },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
