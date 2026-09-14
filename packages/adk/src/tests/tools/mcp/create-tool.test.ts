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

	it("getDeclaration wraps schema conversion failures as INVALID_SCHEMA_ERROR", async () => {
		const schemaConversion = await import(
			"../../../tools/mcp/schema-conversion"
		);
		const spy = vi
			.spyOn(schemaConversion, "mcpSchemaToParameters")
			.mockImplementation(() => {
				throw new Error("broken inputSchema");
			});

		try {
			const tool = await convertMcpToolToBaseTool({
				mcpTool: {
					name: "bad_schema_tool",
					description: "fails declaration",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			});

			expect(() => tool.getDeclaration()).toThrow(
				expect.objectContaining({
					name: "McpError",
					type: McpErrorType.INVALID_SCHEMA_ERROR,
					message: expect.stringContaining(
						"Failed to convert schema for tool bad_schema_tool",
					),
				}),
			);
		} finally {
			spy.mockRestore();
		}
	});

	it("wraps non-McpError constructor failures as INVALID_SCHEMA_ERROR", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: new Proxy(
					{},
					{
						get() {
							throw new Error("adapter boom");
						},
					},
				) as any,
			}),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: expect.stringContaining("Failed to create tool from MCP tool"),
		});
	});

	it("rethrows McpError thrown while constructing the adapter", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: new Proxy(
					{},
					{
						get() {
							throw new McpError("typed ctor", McpErrorType.CONNECTION_ERROR);
						},
					},
				) as any,
			}),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.CONNECTION_ERROR,
			message: "typed ctor",
		});
	});

	it("wraps non-Error constructor throws via String()", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: new Proxy(
					{},
					{
						get() {
							throw "string-ctor-fail";
						},
					},
				) as any,
			}),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: expect.stringContaining("string-ctor-fail"),
		});
	});

	it("constructor catch wraps BaseTool validation failures as INVALID_SCHEMA_ERROR", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "bad-name",
					description: "otherwise valid description text",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: expect.stringContaining("Failed to create tool from MCP tool"),
			originalError: expect.any(Error),
		});

		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "short_desc",
					description: "ab",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: expect.stringContaining("Failed to create tool from MCP tool"),
		});
	});

	it("getDeclaration wraps non-Error schema failures using String(error)", async () => {
		const schemaConversion = await import(
			"../../../tools/mcp/schema-conversion"
		);
		const spy = vi
			.spyOn(schemaConversion, "mcpSchemaToParameters")
			.mockImplementation(() => {
				throw "schema-string-boom";
			});

		try {
			const tool = await convertMcpToolToBaseTool({
				mcpTool: {
					name: "string_schema_fail",
					description: "fails with non-Error throw",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			});

			expect(() => tool.getDeclaration()).toThrow(
				expect.objectContaining({
					type: McpErrorType.INVALID_SCHEMA_ERROR,
					message: expect.stringContaining("schema-string-boom"),
					originalError: undefined,
				}),
			);
		} finally {
			spy.mockRestore();
		}
	});

	it("runAsync wraps non-Error execution failures using String(error)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "raw_fail",
				description: "throws a non-Error value",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => {
				throw 42;
			},
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("Error executing MCP tool raw_fail: 42"),
			originalError: undefined,
		});
	});

	it("runAsync prefers metadata over _meta and skips retry for non-closed errors", async () => {
		const callTool = vi.fn().mockRejectedValue(new Error("permission denied"));
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "meta_priority",
				description: "metadata wins over underscore meta fields",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: true, maxRetryAttempts: 3 },
				_meta: { shouldRetryOnFailure: false, maxRetryAttempts: 1 },
			} as any,
			client: { callTool } as any,
		});

		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(3);

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("permission denied"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
	});

	it("runAsync uses client.callTool without retry when shouldRetryOnFailure is false", async () => {
		const callTool = vi.fn().mockRejectedValue(new Error("closed"));
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "no_retry",
				description: "does not retry closed errors without the flag",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({ a: 1 }, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("closed"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
	});

	it("retries client.callTool and warns when reinitialize is unavailable", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("ECONNRESET");
			}
			return { content: [{ type: "text", text: "recovered" }] };
		});

		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "retry_warn",
				description: "retry without reinitialize",
				inputSchema: { type: "object", properties: {} },
				_meta: { shouldRetryOnFailure: true, maxRetryAttempts: 2 },
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({ q: 1 }, makeContext())).resolves.toEqual({
			content: [{ type: "text", text: "recovered" }],
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize client"),
		);
		warn.mockRestore();
	});

	it("uses empty metadata object when metadata/_meta are non-objects", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "no_meta",
				description: "plain",
				inputSchema: { type: "object", properties: {} },
				metadata: "not-object",
				_meta: 12,
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

});
