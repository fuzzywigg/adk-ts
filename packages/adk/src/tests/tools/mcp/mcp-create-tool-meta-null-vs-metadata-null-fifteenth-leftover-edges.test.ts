import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

const LONG_DESC = "A meaningful MCP tool description for adapter tests";

/**
 * Fifteenth leftover: metadata uses `in` + `typeof === "object"` (null is
 * object → throw on property read); `_meta` uses `_meta &&` so `_meta: null`
 * skips and BaseTool defaults apply.
 */
describe("mcp-create-tool meta null vs metadata null fifteenth leftover", () => {
	it("_meta: null is falsy so defaults apply (no throw)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "meta_null",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				_meta: null,
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("metadata: null still throws (asymmetry control)", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "metadata_null",
					description: LONG_DESC,
					inputSchema: { type: "object", properties: {} },
					metadata: null,
					_meta: { isLongRunning: true },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/isLongRunning|Failed to create tool/);
	});

	it("_meta object still applies flags (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "meta_obj",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				_meta: { isLongRunning: true, maxRetryAttempts: 9 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.maxRetryAttempts).toBe(9);
	});
});
