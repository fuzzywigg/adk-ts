import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover: fourteenth pins isLongRunning `0`/nullish/`true`;
 * nineteenth BaseTool pins `"0"`/`"false"` keep. Through MCP adapter
 * `??` then BaseTool `||`: `"true"` kept; SameValueZero `-0` → false/3.
 */
describe("mcp create-tool flags true/string-true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("isLongRunning $label survives ?? then || keep", async ({ value }) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "long_true",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: value },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(value);
	});

	it("isLongRunning SameValueZero -0 survives ?? then || coerces to false", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "long_neg0",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: -0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("shouldRetryOnFailure $label kept", async ({ value }) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "retry_true",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: value },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe(value);
	});

	it.each([
		{ label: "boolean true", value: true },
		{ label: '"true"', value: "true" },
	])("maxRetryAttempts $label kept via ?? then ||", async ({ value }) => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "max_true",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: value },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(value);
	});

	it("maxRetryAttempts SameValueZero -0 survives ?? then || → 3", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "max_neg0",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata: { maxRetryAttempts: -0 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
