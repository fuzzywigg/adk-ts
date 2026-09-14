import { describe, expect, it } from "vitest";
import * as mcp from "../../../tools/mcp";
import {
	adkToMcpToolType,
	convertMcpToolToBaseTool,
	createSamplingHandler,
	getMcpTools,
	jsonSchemaToDeclaration,
	McpAbi,
	McpAtp,
	McpError,
	McpErrorType,
	McpGeneric,
	McpSamplingHandler,
	McpToolset,
	mcpSchemaToParameters,
	normalizeJsonSchema,
} from "../../../tools/mcp";

describe("tools/mcp barrel exports", () => {
	it("re-exports core MCP classes and helpers", () => {
		expect(McpToolset).toBeTypeOf("function");
		expect(McpSamplingHandler).toBeTypeOf("function");
		expect(McpError).toBeTypeOf("function");
		expect(McpErrorType.CONNECTION_ERROR).toBe("connection_error");
		expect(convertMcpToolToBaseTool).toBeTypeOf("function");
		expect(getMcpTools).toBeTypeOf("function");
		expect(createSamplingHandler).toBeTypeOf("function");
		expect(adkToMcpToolType).toBeTypeOf("function");
		expect(jsonSchemaToDeclaration).toBeTypeOf("function");
		expect(mcpSchemaToParameters).toBeTypeOf("function");
		expect(normalizeJsonSchema).toBeTypeOf("function");
	});

	it("re-exports server factory helpers", () => {
		expect(McpAbi).toBeTypeOf("function");
		expect(McpAtp).toBeTypeOf("function");
		expect(McpGeneric).toBeTypeOf("function");
		expect(mcp.McpCoinGecko).toBeTypeOf("function");
		expect(mcp.McpMemory).toBeTypeOf("function");
		expect(mcp.McpFilesystem).toBeTypeOf("function");
	});

	it("namespace export surface includes toolset and error symbols", () => {
		expect(mcp).toEqual(
			expect.objectContaining({
				McpToolset,
				McpError,
				McpErrorType,
				convertMcpToolToBaseTool,
				getMcpTools,
				McpSamplingHandler,
				createSamplingHandler,
			}),
		);
	});
});
