import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 true/negzero):
 * `description || "MCP Tool"` then BaseTool `!description || length < 3` —
 * POSITIVE_INFINITY / `1` / `{}` / `Object(true)` keep (no `.length` → pass);
 * `NaN` collapses to `"MCP Tool"`. Twentieth pinned `-0` collapse only.
 */
describe("mcp create-tool description posinf/nan/object-true twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("description $label kept via || (no .length → passes min-length)", async ({
		value,
	}) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_residual",
				description: value as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe(value);
	});

	it('description: NaN collapses to "MCP Tool" via ||', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "desc_nan",
				description: Number.NaN as any,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.description).toBe("MCP Tool");
	});
});
