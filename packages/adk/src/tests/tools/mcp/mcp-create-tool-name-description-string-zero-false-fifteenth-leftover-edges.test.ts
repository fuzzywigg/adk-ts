import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: `name || mcp_<ts>` and `description || "MCP Tool"` —
 * seventh/thirteenth pin numeric 0/false → fallback. String `"0"` / `"false"`
 * are truthy: name kept (charset-valid); description `"0"` fails BaseTool
 * min-length 3 while `"false"` is kept.
 */
describe("mcp create-tool name/description string-zero-false fifteenth leftover", () => {
	it.each([
		"0",
		"false",
	])('name "%s" is kept (truthy; charset-valid)', async (name) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: name as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(name);
	});

	it("numeric 0 name still generates mcp_<timestamp> (thirteenth control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: 0 as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name.startsWith("mcp_")).toBe(true);
	});

	it('description "0" is kept then fails BaseTool min-length 3', async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "zero_desc",
					description: "0" as any,
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/too short|Failed to create tool/);
	});

	it('description "false" is kept (length ≥ 3)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "false_desc",
				description: "false" as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("false");
	});

	it("numeric 0 description still coalesces to MCP Tool (seventh control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "num_zero_desc",
				description: 0 as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("MCP Tool");
	});
});
