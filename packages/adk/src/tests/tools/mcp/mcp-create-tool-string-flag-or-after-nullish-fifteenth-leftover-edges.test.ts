import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: adapter uses `??` then BaseTool applies `||`.
 * String `"0"` / `"false"` survive ?? and stay truthy under || — unlike
 * numeric `0` (seventh/fourteenth) which BaseTool coerces away.
 */
describe("mcp create-tool string flag ?? then || fifteenth leftover", () => {
	it('isLongRunning: "0" survives ?? and BaseTool || keeps truthy string', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "str_zero_long",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: "0" },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe("0");
	});

	it('shouldRetryOnFailure: "false" survives ?? and stays truthy under ||', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "str_false_retry",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: "false" },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe("false");
		expect(Boolean(tool.shouldRetryOnFailure)).toBe(true);
	});

	it('maxRetryAttempts: "0" survives ?? and BaseTool || keeps "0" (unlike numeric 0 → 3)', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "str_zero_attempts",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: "0" },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe("0");
	});

	it("numeric 0 still coerced by BaseTool || (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "num_zero_control",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: {
					isLongRunning: 0,
					shouldRetryOnFailure: 0,
					maxRetryAttempts: 0,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
