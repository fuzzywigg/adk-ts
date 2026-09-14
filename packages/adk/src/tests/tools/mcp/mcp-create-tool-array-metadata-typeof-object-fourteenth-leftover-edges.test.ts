import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

const LONG_DESC = "A meaningful MCP tool description for adapter tests";

/**
 * Fourteenth leftover: `"metadata" in … && typeof metadata === "object"` —
 * arrays are objects, so metadata: [] wins over _meta; flags default via ??.
 */
describe("mcp-create-tool array metadata typeof-object fourteenth leftover", () => {
	it("metadata: [] is typeof object so _meta is ignored; flags default", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "array_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: [],
				_meta: {
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 9,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("missing metadata falls through to _meta (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "meta_only",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				_meta: {
					isLongRunning: true,
					maxRetryAttempts: 5,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.maxRetryAttempts).toBe(5);
	});
});
