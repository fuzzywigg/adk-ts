import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover residual deepen (complements #259 true/negzero):
 * `mcpTool.name || mcp_<ts>` then BaseTool `/^[a-zA-Z0-9_]+$/` —
 * POSITIVE_INFINITY / `1` / `Object(true)` keep+charset pass (`"Infinity"` /
 * `"1"` / `"true"`); `{}` keep then charset fail; `NaN` falsy → `mcp_<ts>`.
 * Twentieth pinned `-Infinity` charset fail only.
 */
describe("mcp create-tool name posinf/nan/object-true twentieth residual deepen", () => {
	it("name: POSITIVE_INFINITY kept and charset-passes as Infinity", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: Number.POSITIVE_INFINITY as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(Number.POSITIVE_INFINITY);
	});

	it("name: number 1 kept and charset-passes", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: 1 as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(1);
	});

	it("name: Object(true) kept and charset-passes via ToString true", async () => {
		const boxed = Object(true);
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: boxed as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name).toBe(boxed);
	});

	it("name: {} is truthy || keep then fails charset [object Object]", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: {} as any,
					description: "meaningful description",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/Invalid tool name|Failed to create tool/);
	});

	it("name: NaN collapses to mcp_<timestamp> via ||", async () => {
		const before = Date.now();
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: Number.NaN as any,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.name.startsWith("mcp_")).toBe(true);
		expect(Number(tool.name.slice(4))).toBeGreaterThanOrEqual(before);
	});
});
