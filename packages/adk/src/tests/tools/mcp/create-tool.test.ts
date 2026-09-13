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

	it("reads metadata from mcpTool.metadata and _meta", async () => {
		const withMetadata = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "meta_tool",
				description: "Has metadata",
				inputSchema: { type: "object", properties: {} },
				metadata: {
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 5,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(withMetadata.isLongRunning).toBe(true);
		expect(withMetadata.shouldRetryOnFailure).toBe(true);
		expect(withMetadata.maxRetryAttempts).toBe(5);

		const withMeta = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "underscore_meta",
				description: "Has _meta",
				inputSchema: { type: "object", properties: {} },
				_meta: { isLongRunning: true },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(withMeta.isLongRunning).toBe(true);
	});

	it("prefers mcpTool.execute and clientService.callTool over toolHandler", async () => {
		const execute = vi
			.fn()
			.mockResolvedValue({ content: [{ type: "text", text: "exec" }] });
		const executed = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "executable",
				description: "Has execute",
				inputSchema: { type: "object", properties: {} },
				execute,
			} as any,
			toolHandler: vi.fn(),
		});
		await expect(executed.runAsync({ x: 1 }, makeContext())).resolves.toEqual({
			content: [{ type: "text", text: "exec" }],
		});
		expect(execute).toHaveBeenCalledWith({ x: 1 });

		const callTool = vi.fn().mockResolvedValue({ ok: true });
		const reinitialize = vi.fn();
		const withService = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "service_tool",
				description: "Uses client service",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize } as any,
		});
		await expect(
			withService.runAsync({ a: 2 }, makeContext()),
		).resolves.toEqual({ ok: true });
		expect(callTool).toHaveBeenCalledWith("service_tool", { a: 2 });
	});

	it("wraps non-McpError execution failures", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "broken",
				description: "Throws",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => {
				throw new Error("boom");
			},
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			message: expect.stringContaining("Error executing MCP tool broken: boom"),
			type: McpErrorType.TOOL_EXECUTION_ERROR,
		});
	});

	it("defaults name/description and retries client.callTool on closed errors", async () => {
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("socket hang up");
			}
			return { content: [{ type: "text", text: "retry-ok" }] };
		});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				inputSchema: { type: "object", properties: {} },
				_meta: { shouldRetryOnFailure: true, maxRetryAttempts: 2 },
			} as any,
			client: { callTool } as any,
		});

		expect(tool.name).toMatch(/^mcp_/);
		expect(tool.description).toBe("MCP Tool");
		await expect(tool.runAsync({ q: 1 }, makeContext())).resolves.toEqual({
			content: [{ type: "text", text: "retry-ok" }],
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("rethrows McpError from execute without wrapping", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "typed",
				description: "typed fail",
				inputSchema: { type: "object", properties: {} },
				execute: async () => {
					throw new McpError("typed", McpErrorType.INVALID_SCHEMA_ERROR);
				},
			} as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: "typed",
		});
	});
});
