import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Nineteenth leftover: `mcpTool.name || mcp_<ts>` and `description || "MCP Tool"`
 * — string "0"/"false" kept (thirteenth/seventh pin falsy → timestamp / MCP Tool).
 */
describe("mcp create-tool name/description string-zero/false nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("name: %j kept (charset OK, unlike falsy → mcp_<ts>)", async (name) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(name);
	});

	it('description: "false" kept via || (length ≥ 3)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_false_keep",
				description: "false",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("false");
	});

	it('description: "0" kept by || then fails BaseTool min-length 3', async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "desc_zero_fail",
					description: "0",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/too short|Failed to create tool/);
	});

	it("falsy name still generates mcp_<timestamp> (control)", async () => {
		const before = Date.now();
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "" as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name.startsWith("mcp_")).toBe(true);
		const ts = Number(tool.name.slice(4));
		expect(ts).toBeGreaterThanOrEqual(before);
	});
});
