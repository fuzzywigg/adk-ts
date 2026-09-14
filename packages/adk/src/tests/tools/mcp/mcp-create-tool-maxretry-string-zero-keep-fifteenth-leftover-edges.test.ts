import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: `maxRetryAttempts ?? 3` then BaseTool `|| 3`.
 * String "0" is truthy for both so stays "0"; numeric 0 → 3 (seventh).
 */
describe("mcp create-tool maxRetryAttempts string-zero keep fifteenth leftover", () => {
	it('maxRetryAttempts: "0" kept through ?? and ||', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "str_zero_maxretry",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: "0" },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe("0");
	});

	it("numeric 0 still coerces to 3 (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "num_zero_maxretry",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: 0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
