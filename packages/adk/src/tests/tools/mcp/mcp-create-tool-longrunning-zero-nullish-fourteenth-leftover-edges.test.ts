import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Fourteenth leftover: adapter uses `metadata.isLongRunning ?? false` /
 * `shouldRetryOnFailure ?? false`, then BaseTool applies `|| false`.
 * `0` survives ?? but is coerced by ||; `null`/`undefined` collapse at ??.
 */
describe("mcp create-tool isLongRunning/shouldRetry zero-nullish fourteenth leftover", () => {
	it("isLongRunning: 0 survives ?? then BaseTool || false coerces to false", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "zero_long",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: 0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
	});

	it("shouldRetryOnFailure: 0 survives ?? then BaseTool || false coerces to false", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "zero_retry_flag",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: 0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it.each([
		null,
		undefined,
	] as const)("isLongRunning %j collapses at ?? before BaseTool", async (isLongRunning) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "nullish_long",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
	});

	it("isLongRunning: true still kept (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "true_long",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: true },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(true);
	});
});
