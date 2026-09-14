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

	it("getDeclaration wraps non-Error schema failures via String(error)", async () => {
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
					description: "fails with string",
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

	it("wraps constructor Error failures as INVALID_SCHEMA_ERROR", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					get name() {
						throw new Error("ctor boom");
					},
					description: "fails in adapter ctor",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: expect.stringContaining(
				"Failed to create tool from MCP tool: ctor boom",
			),
		});
	});

	it("wraps constructor non-Error throws via String(error)", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					get name() {
						throw "ctor-string-fail";
					},
					description: "fails with string in ctor",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: expect.stringContaining("ctor-string-fail"),
			originalError: undefined,
		});
	});

	it("rethrows McpError thrown during adapter construction", async () => {
		const typed = new McpError("typed ctor", McpErrorType.CONNECTION_ERROR);
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					get name() {
						throw typed;
					},
					description: "typed ctor fail",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toBe(typed);
	});

	it("ignores non-object metadata and non-object _meta", async () => {
		const withBadMetadata = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bad_meta",
				description: "non-object metadata",
				inputSchema: { type: "object", properties: {} },
				metadata: "not-an-object",
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(withBadMetadata.isLongRunning).toBe(false);
		expect(withBadMetadata.shouldRetryOnFailure).toBe(false);
		expect(withBadMetadata.maxRetryAttempts).toBe(3);

		const withBadUnderscore = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bad_underscore",
				description: "non-object _meta",
				inputSchema: { type: "object", properties: {} },
				_meta: 42,
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(withBadUnderscore.isLongRunning).toBe(false);
	});

	it("prefers metadata over _meta when both exist", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "both_meta",
				description: "both",
				inputSchema: { type: "object", properties: {} },
				metadata: { isLongRunning: true, maxRetryAttempts: 9 },
				_meta: { isLongRunning: false, maxRetryAttempts: 1 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.maxRetryAttempts).toBe(9);
	});

	it("does not treat client as clientService unless reinitialize is a function", async () => {
		const callTool = vi.fn().mockResolvedValue({ ok: true });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "plain_client",
				description: "reinitialize is not a function",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize: "nope" } as any,
		});

		await expect(tool.runAsync({ a: 1 }, makeContext())).resolves.toEqual({
			ok: true,
		});
		expect(callTool).toHaveBeenCalledWith({
			name: "plain_client",
			arguments: { a: 1 },
		});
	});

	it("uses client.callTool without retry when shouldRetryOnFailure is false", async () => {
		const callTool = vi.fn().mockRejectedValue(new Error("socket hang up"));
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "no_retry",
				description: "no retry",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: false },
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("socket hang up"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
	});

	it("retries client.callTool on ECONNRESET and exhausts maxRetryAttempts", async () => {
		const callTool = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "reset_tool",
				description: "retries then fails",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: true, maxRetryAttempts: 1 },
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({ q: 1 }, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("ECONNRESET"),
		});
		expect(callTool).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize client"),
		);
		warn.mockRestore();
	});

	it("prefers mcpTool.execute over clientService even when both exist", async () => {
		const execute = vi.fn().mockResolvedValue({ via: "execute" });
		const callTool = vi.fn().mockResolvedValue({ via: "service" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "exec_wins",
				description: "execute preferred",
				inputSchema: { type: "object", properties: {} },
				execute,
			} as any,
			client: { callTool, reinitialize: vi.fn() } as any,
		});

		await expect(tool.runAsync({ x: 1 }, makeContext())).resolves.toEqual({
			via: "execute",
		});
		expect(execute).toHaveBeenCalledWith({ x: 1 });
		expect(callTool).not.toHaveBeenCalled();
	});

	it("routes through clientService.callTool when reinitialize is present", async () => {
		const callTool = vi.fn().mockResolvedValue({ via: "service" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "service_wins",
				description: "service preferred",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: {
				callTool,
				reinitialize: vi.fn(),
			} as any,
		});

		expect((tool as any).clientService).toBeTruthy();
		await expect(tool.runAsync({ z: 1 }, makeContext())).resolves.toEqual({
			via: "service",
		});
		expect(callTool).toHaveBeenCalledWith("service_wins", { z: 1 });
	});

	it("wraps non-Error execution failures via String(error)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "string_exec",
				description: "throws string",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => {
				throw "plain-string-failure";
			},
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("plain-string-failure"),
			originalError: undefined,
		});
		expect(errorSpy).toHaveBeenCalled();
		errorSpy.mockRestore();
	});

	it("falls through to toolHandler when client has no callTool method", async () => {
		const toolHandler = vi.fn().mockResolvedValue({ via: "handler" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "handler_fallback",
				description: "client without callTool",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { ping: vi.fn() } as any,
			toolHandler,
		});

		await expect(tool.runAsync({ q: "x" }, makeContext())).resolves.toEqual({
			via: "handler",
		});
		expect(toolHandler).toHaveBeenCalledWith("handler_fallback", { q: "x" });
	});

	it("ignores execute when it is present but not a function", async () => {
		const toolHandler = vi.fn().mockResolvedValue({ via: "handler" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bad_execute",
				description: "execute is a string",
				inputSchema: { type: "object", properties: {} },
				execute: "not-a-function",
			} as any,
			toolHandler,
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			via: "handler",
		});
	});

	it("rethrows McpError from client.callTool without wrapping", async () => {
		const typed = new McpError("client typed", McpErrorType.TIMEOUT_ERROR);
		const callTool = vi.fn().mockRejectedValue(typed);
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "typed_client",
				description: "typed client fail",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toBe(typed);
	});

	it("rethrows McpError from clientService.callTool without wrapping", async () => {
		const typed = new McpError(
			"service typed",
			McpErrorType.RESOURCE_CLOSED_ERROR,
		);
		const callTool = vi.fn().mockRejectedValue(typed);
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "typed_service",
				description: "typed service fail",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize: vi.fn() } as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toBe(typed);
	});

	it("passes empty args through to execute and toolHandler", async () => {
		const execute = vi.fn().mockResolvedValue({ empty: true });
		const executed = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "empty_args",
				description: "empty",
				inputSchema: { type: "object", properties: {} },
				execute,
			} as any,
		});
		await expect(executed.runAsync({}, makeContext())).resolves.toEqual({
			empty: true,
		});
		expect(execute).toHaveBeenCalledWith({});

		const toolHandler = vi.fn().mockResolvedValue({ handled: true });
		const handled = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "empty_handler",
				description: "empty handler",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler,
		});
		await expect(handled.runAsync({}, makeContext())).resolves.toEqual({
			handled: true,
		});
		expect(toolHandler).toHaveBeenCalledWith("empty_handler", {});
	});
});
