import { describe, expect, it, vi } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

const LONG_DESC = "A meaningful MCP tool description for adapter tests";

describe("MCP create-tool fifth leftover edges (post #146)", () => {
	it("prefers metadata over _meta when both are present", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "both_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: {
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 7,
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
		expect(tool.maxRetryAttempts).toBe(7);
	});

	it("null metadata is typeof object so assignment then throws on property read", async () => {
		await expect(
			convertMcpToolToBaseTool({
				mcpTool: {
					name: "null_meta",
					description: LONG_DESC,
					inputSchema: { type: "object", properties: {} },
					metadata: null,
					_meta: { isLongRunning: true },
				} as any,
				toolHandler: async () => ({ content: [] }),
			}),
		).rejects.toThrow(/isLongRunning|Failed to create tool/);
	});

	it.each([
		"string",
		12,
		true,
	] as const)("ignores non-object metadata %j and falls through to _meta", async (metadata) => {
		const withBadMetadata = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "bad_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata,
				_meta: { isLongRunning: true, maxRetryAttempts: 4 },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(withBadMetadata.isLongRunning).toBe(true);
		expect(withBadMetadata.maxRetryAttempts).toBe(4);
	});

	it("ignores non-object _meta and uses BaseTool defaults", async () => {
		const defaultsOnly = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "defaults",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: "skip",
				_meta: "also-bad",
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(defaultsOnly.isLongRunning).toBe(false);
		expect(defaultsOnly.shouldRetryOnFailure).toBe(false);
		expect(defaultsOnly.maxRetryAttempts).toBe(3);
	});

	it("defaults name to mcp_Date.now prefix when name is falsy", async () => {
		const before = Date.now();
		const toolA = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		await new Promise((r) => setTimeout(r, 2));
		const toolB = await convertMcpToolToBaseTool({
			mcpTool: {
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		const after = Date.now();

		expect(toolA.name).toMatch(/^mcp_\d+$/);
		expect(toolB.name).toMatch(/^mcp_\d+$/);
		const tsA = Number(toolA.name.replace("mcp_", ""));
		const tsB = Number(toolB.name.replace("mcp_", ""));
		expect(tsA).toBeGreaterThanOrEqual(before);
		expect(tsB).toBeLessThanOrEqual(after);
		expect(tsB).toBeGreaterThanOrEqual(tsA);
	});

	it("reinitialize present but not a function falls through to client.callTool", async () => {
		const callTool = vi.fn().mockResolvedValue({ ok: "client" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "reinit_not_fn",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize: "nope" } as any,
		});

		await expect(tool.runAsync({ a: 1 }, makeContext())).resolves.toEqual({
			ok: "client",
		});
		expect(callTool).toHaveBeenCalledWith({
			name: "reinit_not_fn",
			arguments: { a: 1 },
		});
	});

	it("execute wins over clientService when both exist", async () => {
		const execute = vi.fn().mockResolvedValue({ via: "execute" });
		const callTool = vi.fn().mockResolvedValue({ via: "service" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "exec_wins",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				execute,
			} as any,
			client: { callTool, reinitialize: vi.fn() } as any,
		});

		await expect(tool.runAsync({ z: 9 }, makeContext())).resolves.toEqual({
			via: "execute",
		});
		expect(execute).toHaveBeenCalledWith({ z: 9 });
		expect(callTool).not.toHaveBeenCalled();
	});

	it("clientService path ignores shouldRetryOnFailure (no withRetry wrapper)", async () => {
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("transient");
			}
			return { ok: true };
		});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "service_no_retry",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: { shouldRetryOnFailure: true, maxRetryAttempts: 5 },
			} as any,
			client: { callTool, reinitialize: vi.fn() } as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			message: expect.stringContaining("transient"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(callTool).toHaveBeenCalledWith("service_no_retry", {});
	});

	it("getDeclaration happy path returns schema parameters", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "decl",
				description: "Declare me with a long enough description",
				inputSchema: {
					type: "object",
					properties: {
						q: { type: "string" },
						n: { type: "number" },
					},
					required: ["q"],
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("decl");
		expect(declaration.description).toContain("Declare me");
		expect(declaration.parameters?.properties?.q).toBeDefined();
		expect(declaration.parameters?.properties?.n).toBeDefined();
		expect(declaration.parameters?.required).toEqual(["q"]);
	});

	it("defaults isLongRunning/shouldRetryOnFailure/maxRetryAttempts when metadata empty", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "plain",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: {},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});

		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
