import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover: nineteenth pins name/description `"0"`/`"false"` keep.
 * Boolean `true` / `"true"` kept via `||`; SameValueZero `-0` coalesces.
 */
describe("mcp create-tool name/description true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("name $label kept via || (charset OK after ToString)", async ({
		value,
	}) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: value as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(value);
	});

	it("name SameValueZero -0 still generates mcp_<timestamp>", async () => {
		const before = Date.now();
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: -0 as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name.startsWith("mcp_")).toBe(true);
		const ts = Number(tool.name.slice(4));
		expect(ts).toBeGreaterThanOrEqual(before);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("description $label kept via ||", async ({ value }) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_true_keep",
				description: value as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe(value);
	});

	it("description SameValueZero -0 still coalesces to MCP Tool", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_neg0",
				description: -0 as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("MCP Tool");
	});

	it('name "false" still kept (nineteenth control)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "false",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe("false");
	});
});
