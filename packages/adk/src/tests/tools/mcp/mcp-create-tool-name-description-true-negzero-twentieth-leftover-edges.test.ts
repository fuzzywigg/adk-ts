import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #233 nineteenth):
 * `mcpTool.name || mcp_<ts>` / `description || "MCP Tool"` — boolean `true` /
 * `"true"` / `NEGATIVE_INFINITY` keep (near-miss); SameValueZero `-0` collapses;
 * `[]` fails charset / min-length. Nineteenth pinned string `"0"`/`"false"` only.
 */
describe("mcp create-tool name/description true/negzero twentieth leftover", () => {
	it('name: boolean true kept via || (charset coerces true→"true")', async () => {
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

	it('name: "true" kept via || (charset OK)', async () => {
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

	it("name: -0 collapses to mcp_<timestamp> via ||", async () => {
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
		expect(Number(tool.name.slice(4))).toBeGreaterThanOrEqual(before);
	});

	it("name: [] is truthy || keep then fails BaseTool charset", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: [] as any,
					description: "meaningful description",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/Invalid tool name|Failed to create tool/);
	});

	it("name: NEGATIVE_INFINITY is truthy || keep then fails charset (-)", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: Number.NEGATIVE_INFINITY as any,
					description: "meaningful description",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/Invalid tool name|Failed to create tool/);
	});

	it("description: boolean true kept via || (no .length → passes min-length)", async () => {
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

	it('description: "true" kept via || (length 4)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_str_true",
				description: "true",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("true");
	});

	it("description: NEGATIVE_INFINITY kept via || (no .length → passes)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_ninf",
				description: Number.NEGATIVE_INFINITY as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe(Number.NEGATIVE_INFINITY);
	});

	it('description: -0 collapses to "MCP Tool" via ||', async () => {
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

	it("description: [] is truthy || keep then fails min-length (length 0)", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "desc_arr",
					description: [] as any,
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/too short|Failed to create tool/);
	});
});
