import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: `name || mcp_${Date.now()}` — string "0" is truthy and
 * kept (alphanumeric charset OK). Numeric 0 still generates mcp_* (thirteenth).
 */
describe("mcp create-tool name string-zero keep fifteenth leftover", () => {
	it('name: "0" is truthy and kept as tool.name', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "0",
				description: "meaningful description for zero-named tool",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe("0");
	});

	it("numeric name: 0 still generates mcp_<timestamp> (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: 0 as any,
				description: "meaningful description for numeric zero name",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name.startsWith("mcp_")).toBe(true);
	});
});
