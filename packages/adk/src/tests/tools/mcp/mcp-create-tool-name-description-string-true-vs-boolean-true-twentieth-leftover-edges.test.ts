import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover: `mcpTool.name || mcp_<ts>` / `description || "MCP Tool"`
 * — string `"true"` kept (nineteenth pinned `"0"`/`"false"`). Boolean `true`
 * name survives `||` and RegExp.test ToString-coerces to `"true"`; boolean
 * `false` name is falsy and falls through to `mcp_<ts>`.
 */
describe("mcp create-tool name/description string-true vs boolean-true twentieth leftover", () => {
	it('name: "true" kept (charset OK via alphanumeric)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "true",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe("true");
	});

	it("name: boolean true kept as boolean (RegExp.test coerces ToString)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: true as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(true);
	});

	it("name: boolean false is falsy → mcp_<timestamp> (asymmetry vs true)", async () => {
		const before = Date.now();
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: false as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name.startsWith("mcp_")).toBe(true);
		const ts = Number(tool.name.slice(4));
		expect(ts).toBeGreaterThanOrEqual(before);
	});

	it('description: "true" kept via || (length 4 ≥ 3)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_true_keep",
				description: "true",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("true");
	});

	it("description: boolean true kept (truthy; .length undefined skips min-length)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_bool_true",
				description: true as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe(true);
	});
});
