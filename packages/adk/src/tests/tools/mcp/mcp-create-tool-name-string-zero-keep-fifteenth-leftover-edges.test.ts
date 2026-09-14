import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: `mcpTool.name || mcp_<ts>` — string "0" is truthy and
 * alphanumeric so BaseTool accepts it; numeric 0 falls through to mcp_ prefix.
 */
describe("mcp create-tool name string-zero keep fifteenth leftover", () => {
	it('name: "0" is kept as the tool name', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "0",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe("0");
	});

	it("numeric name 0 falls through to mcp_ timestamp prefix (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: 0 as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toMatch(/^mcp_\d+$/);
	});
});
