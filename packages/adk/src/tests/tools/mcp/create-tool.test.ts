import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";
import { McpError, McpErrorType } from "../../../tools/mcp/types";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("convertMcpToolToBaseTool", () => {
	it("creates a tool with name and description from mcpTool", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "lookup",
				description: "Look up a value",
				inputSchema: {
					type: "object",
					properties: {},
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.name).toBe("lookup");
		expect(tool.description).toBe("Look up a value");
	});

	it("converts the MCP schema in getDeclaration", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "search",
				description: "Search things",
				inputSchema: {
					type: "object",
					properties: {
						query: { type: "string" },
					},
					required: ["query"],
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("search");
		expect(declaration.description).toBe("Search things");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.properties?.query).toEqual({
			type: Type.STRING,
		});
		expect(declaration.parameters?.required).toEqual(["query"]);
	});

	it("runAsync uses toolHandler when provided", async () => {
		const toolHandler = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "handled" }],
		});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "handled_tool",
				description: "Handles requests via a custom tool handler",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler,
		});

		const result = await tool.runAsync({ q: "x" }, makeContext());

		expect(toolHandler).toHaveBeenCalledWith("handled_tool", { q: "x" });
		expect(result).toEqual({
			content: [{ type: "text", text: "handled" }],
		});
	});

	it("runAsync uses client.callTool when a client is provided", async () => {
		const callTool = vi.fn().mockResolvedValue({
			content: [{ type: "text", text: "from client" }],
		});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "client_tool",
				description: "Executes through an MCP client callTool method",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool } as any,
		});

		const result = await tool.runAsync({ a: 1 }, makeContext());

		expect(callTool).toHaveBeenCalledWith({
			name: "client_tool",
			arguments: { a: 1 },
		});
		expect(result).toEqual({
			content: [{ type: "text", text: "from client" }],
		});
	});

	it("throws McpError when no execution method is available", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "orphan",
				description: "Tool without any available execution method",
				inputSchema: { type: "object", properties: {} },
			} as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			message: expect.stringContaining("No execution method found"),
			type: McpErrorType.TOOL_EXECUTION_ERROR,
		});
		await expect(tool.runAsync({}, makeContext())).rejects.toBeInstanceOf(
			McpError,
		);
	});
});
