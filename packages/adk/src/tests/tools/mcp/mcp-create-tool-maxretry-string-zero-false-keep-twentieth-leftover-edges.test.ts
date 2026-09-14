import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover: `maxRetryAttempts ?? 3` then BaseTool `|| 3` —
 * string "0"/"false" survive both operators (unlike numeric 0 → 3).
 */
describe("mcp create-tool maxRetryAttempts string-zero/false keep twentieth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("maxRetryAttempts: %j kept via ?? then ||", async (value) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: `max_${value}`,
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: value },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(value);
	});

	it("numeric 0 still → 3 (seventh control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "max_zero_num",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: 0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("null still → 3 via ?? (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "max_null",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: null },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
