import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fifteenth leftover: adapter `?? false` then BaseTool `|| false`.
 * String "0" survives both (truthy); numeric 0 coerced to false (fourteenth).
 */
describe("mcp create-tool longrunning/retry string-zero keep fifteenth leftover", () => {
	it('isLongRunning: "0" survives ?? and BaseTool || as truthy string', async () => {
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

	it('shouldRetryOnFailure: "0" survives ?? and BaseTool || as truthy string', async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "str_zero_retry",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: "0" },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe("0");
	});

	it("numeric 0 still coerces to false (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "num_zero_long",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: 0, shouldRetryOnFailure: 0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});
});
