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

	it("getDeclaration wraps non-Error schema throws via String() without originalError", async () => {
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
					name: "non_error_schema",
					description: "fails declaration with non-Error",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			});

			let caught: McpError | undefined;
			try {
				tool.getDeclaration();
			} catch (error) {
				caught = error as McpError;
			}

			expect(caught?.type).toBe(McpErrorType.INVALID_SCHEMA_ERROR);
			expect(caught?.message).toContain("non_error_schema");
			expect(caught?.message).toContain("schema-string-boom");
			expect(caught?.originalError).toBeUndefined();
		} finally {
			spy.mockRestore();
		}
	});

	it("runAsync wraps non-Error execute throws via String() without originalError", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "non_error_exec",
				description: "throws a non-Error from execute",
				inputSchema: { type: "object", properties: {} },
				execute: async () => {
					throw { code: 500 };
				},
			} as any,
		});

		let caught: McpError | undefined;
		try {
			await tool.runAsync({}, makeContext());
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.TOOL_EXECUTION_ERROR);
		expect(caught?.message).toContain("non_error_exec");
		expect(caught?.message).toContain("[object Object]");
		expect(caught?.originalError).toBeUndefined();
	});

	it("wraps BaseTool invalid name errors as INVALID_SCHEMA_ERROR", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "bad-name-with-dashes",
					description: "invalid BaseTool name characters",
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
	});

	it("wraps BaseTool short description errors as INVALID_SCHEMA_ERROR", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "ok_name",
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

	it("clientService path uses name+args callTool signature when reinitialize is present", async () => {
		const reinitialize = vi.fn(async () => undefined);
		let attempts = 0;
		const callTool = vi.fn(
			async (name: string, args: Record<string, unknown>) => {
				attempts++;
				if (attempts === 1) {
					await reinitialize();
					throw new Error("session closed");
				}
				return { content: [{ type: "text", text: `ok:${name}:${args.q}` }] };
			},
		);

		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "service_retry",
				description: "Uses clientService with reinitialize present",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize } as any,
		});

		await expect(tool.runAsync({ q: 1 }, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("session closed"),
		});
		expect(callTool).toHaveBeenCalledWith("service_retry", { q: 1 });
		expect(reinitialize).toHaveBeenCalledTimes(1);

		await expect(tool.runAsync({ q: 2 }, makeContext())).resolves.toEqual({
			content: [{ type: "text", text: "ok:service_retry:2" }],
		});
		expect(callTool).toHaveBeenCalledWith("service_retry", { q: 2 });
	});

	it("detects clientService via reinitialize and calls service-style callTool", async () => {
		const serviceCallTool = vi.fn().mockResolvedValue({ ok: "service" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "prefer_service",
				description: "Prefers McpClientService style callTool",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: {
				callTool: serviceCallTool,
				reinitialize: vi.fn(async () => undefined),
			} as any,
		});

		await expect(tool.runAsync({ a: 1 }, makeContext())).resolves.toEqual({
			ok: "service",
		});
		expect(serviceCallTool).toHaveBeenCalledWith("prefer_service", { a: 1 });
		expect(serviceCallTool).not.toHaveBeenCalledWith({
			name: "prefer_service",
			arguments: { a: 1 },
		});
	});

	it("runAsync wraps non-Error toolHandler throws via String()", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "handler_string_throw",
				description: "toolHandler throws a string",
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => {
				throw "handler-string-fail";
			},
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("handler-string-fail"),
			originalError: undefined,
		});
	});

	it("getDeclaration wraps Error schema failures with originalError", async () => {
		const schemaConversion = await import(
			"../../../tools/mcp/schema-conversion"
		);
		const root = new Error("broken schema object");
		const spy = vi
			.spyOn(schemaConversion, "mcpSchemaToParameters")
			.mockImplementation(() => {
				throw root;
			});

		try {
			const tool = await convertMcpToolToBaseTool({
				mcpTool: {
					name: "error_schema",
					description: "fails declaration with Error",
					inputSchema: { type: "object", properties: {} },
				} as any,
				toolHandler: async () => ({ content: [] }),
			});

			let caught: McpError | undefined;
			try {
				tool.getDeclaration();
			} catch (error) {
				caught = error as McpError;
			}

			expect(caught?.type).toBe(McpErrorType.INVALID_SCHEMA_ERROR);
			expect(caught?.originalError).toBe(root);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("convertMcpToolToBaseTool leftover metadata/retry edges", () => {
	it("prefers metadata over conflicting _meta when both are present", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "both_meta",
				description: "metadata wins over _meta flags",
				inputSchema: { type: "object", properties: {} },
				metadata: {
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 5,
				},
				_meta: {
					isLongRunning: false,
					shouldRetryOnFailure: false,
					maxRetryAttempts: 1,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(5);
	});

	it("warns that plain client cannot reinitialize on closed-resource retries", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("connection closed");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});

		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "retry_plain",
				description: "plain client closed-resource retry path",
				inputSchema: { type: "object", properties: {} },
				metadata: {
					shouldRetryOnFailure: true,
					maxRetryAttempts: 1,
				},
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize client"),
		);
		warn.mockRestore();
	});

	it("does not retry closed errors when shouldRetryOnFailure is false", async () => {
		const callTool = vi.fn(async () => {
			throw new Error("connection closed");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "no_retry_closed",
				description: "closed error without retry enabled",
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: false },
			} as any,
			client: { callTool } as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("connection closed"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize client"),
		);
		warn.mockRestore();
	});
});
