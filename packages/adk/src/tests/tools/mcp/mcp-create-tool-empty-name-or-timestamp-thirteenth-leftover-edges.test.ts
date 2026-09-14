import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Thirteenth leftover: `name: mcpTool.name || \`mcp_${Date.now()}\`` —
 * empty/0/false generate a mcp_ timestamp; whitespace fails BaseTool charset.
 */
describe("mcp create-tool empty name or-timestamp thirteenth leftover", () => {
	it.each([
		{ label: "empty string", name: "" },
		{ label: "null", name: null },
		{ label: "undefined", name: undefined },
		{ label: "0", name: 0 },
		{ label: "false", name: false },
	])("falsy name ($label) generates mcp_<timestamp>", async ({ name }) => {
		const before = Date.now();
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: name as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		const after = Date.now();
		expect(tool.name.startsWith("mcp_")).toBe(true);
		const ts = Number(tool.name.slice(4));
		expect(ts).toBeGreaterThanOrEqual(before);
		expect(ts).toBeLessThanOrEqual(after + 2000);
	});

	it("whitespace name is truthy then fails BaseTool charset", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: " ",
					description: "meaningful description",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/Invalid tool name|Failed to create tool/);
	});

	it("valid name is kept (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "keep_me",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe("keep_me");
	});
});
