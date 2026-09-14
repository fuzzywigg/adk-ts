import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: description "0" is truthy so skips `|| "MCP Tool"`, then
 * BaseTool length < 3 throws (wrapped as McpError). Falsy 0 coalesces (seventh).
 */
describe("mcp create-tool description string-zero too-short fifteenth leftover", () => {
	it('description: "0" fails BaseTool min-length 3', async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "short_desc",
					description: "0",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/too short|Failed to create tool/);
	});

	it('description: "0ab" is long enough and kept (control)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "ok_desc",
				description: "0ab",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("0ab");
	});

	it("numeric description 0 still coalesces to MCP Tool (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "num_desc",
				description: 0 as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("MCP Tool");
	});
});
