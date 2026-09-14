import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

const LONG_DESC = "A meaningful MCP tool description for adapter tests";

/**
 * Fifteenth leftover: `_meta && typeof _meta === "object"` — arrays are
 * objects, so `_meta: []` is assigned; flags then default via `??`
 * (mirror of fourteenth `metadata: []` winning over `_meta`).
 */
describe("mcp create-tool _meta array underscore fifteenth leftover", () => {
	it("_meta: [] is typeof object so flags default via ??", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "array_underscore_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				_meta: [],
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("_meta object still applies flags (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "object_underscore_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				_meta: {
					isLongRunning: true,
					maxRetryAttempts: 8,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.maxRetryAttempts).toBe(8);
	});
});
