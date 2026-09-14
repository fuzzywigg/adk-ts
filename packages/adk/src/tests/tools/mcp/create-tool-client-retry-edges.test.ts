import { afterEach, describe, expect, it, vi } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";
import { McpError, McpErrorType } from "../../../tools/mcp/types";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

function makeClientTool(
	callTool: ReturnType<typeof vi.fn>,
	meta: {
		shouldRetryOnFailure?: boolean;
		maxRetryAttempts?: number;
		name?: string;
	} = {},
) {
	return convertMcpToolToBaseTool({
		mcpTool: {
			name: meta.name ?? "retry_tool",
			description: "MCP client retry edge coverage tool",
			inputSchema: { type: "object", properties: {} },
			_meta: {
				shouldRetryOnFailure: meta.shouldRetryOnFailure ?? true,
				maxRetryAttempts: meta.maxRetryAttempts ?? 2,
			},
		} as any,
		client: { callTool } as any,
	});
}

describe("MCP create-tool client retry edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("exhausts retries on persistent closed errors and wraps as TOOL_EXECUTION_ERROR", async () => {
		const callTool = vi.fn(async () => {
			throw new Error("connection closed by peer");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 2,
		});

		await expect(tool.runAsync({ q: 1 }, makeContext())).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("connection closed by peer"),
		});

		// withRetry: attempt 0..maxRetries inclusive => 3 calls for maxRetries=2
		expect(callTool).toHaveBeenCalledTimes(3);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				"encountered a closed resource, but cannot reinitialize client",
			),
		);
	});

	it("warns cannot-reinitialize on each closed retry before success", async () => {
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("resource closed");
			}
			return { content: [{ type: "text", text: "recovered" }] };
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			name: "recover_tool",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 3,
		});

		await expect(tool.runAsync({ a: 1 }, makeContext())).resolves.toEqual({
			content: [{ type: "text", text: "recovered" }],
		});

		expect(callTool).toHaveBeenCalledTimes(3);
		const cannotReinit = warn.mock.calls.filter((c) =>
			String(c[0]).includes(
				"MCP tool recover_tool encountered a closed resource, but cannot reinitialize client",
			),
		);
		expect(cannotReinit.length).toBeGreaterThanOrEqual(2);
	});

	it("shouldRetryOnFailure false performs a single client.callTool and does not warn", async () => {
		const callTool = vi.fn(async () => {
			throw new Error("socket hang up");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: false,
			maxRetryAttempts: 5,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("socket hang up"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize client"),
		);
	});

	it("retries closed-error string variant: 'closed'", async () => {
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("stream closed unexpectedly");
			}
			return { ok: "closed-variant" };
		});
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 1,
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			ok: "closed-variant",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("retries closed-error string variant: ECONNRESET", async () => {
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("read ECONNRESET");
			}
			return { ok: "econnreset-variant" };
		});
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 1,
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			ok: "econnreset-variant",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("retries closed-error string variant: socket hang up", async () => {
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("socket hang up");
			}
			return { ok: "hangup-variant" };
		});
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 1,
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			ok: "hangup-variant",
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("does not retry non-closed errors even when shouldRetryOnFailure is true", async () => {
		const callTool = vi.fn(async () => {
			throw new Error("permission denied");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 5,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("permission denied"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize"),
		);
	});

	it("passes name and arguments to client.callTool on each retry attempt", async () => {
		let attempts = 0;
		const callTool = vi.fn(
			async (payload: { name: string; arguments: any }) => {
				attempts++;
				if (attempts === 1) {
					throw new Error("closed");
				}
				return { payload };
			},
		);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			name: "args_tool",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 2,
		});

		const result = await tool.runAsync({ q: "x", n: 3 }, makeContext());
		expect(result).toEqual({
			payload: { name: "args_tool", arguments: { q: "x", n: 3 } },
		});
		expect(callTool).toHaveBeenNthCalledWith(1, {
			name: "args_tool",
			arguments: { q: "x", n: 3 },
		});
		expect(callTool).toHaveBeenNthCalledWith(2, {
			name: "args_tool",
			arguments: { q: "x", n: 3 },
		});
	});

	it("maxRetryAttempts 0 from metadata falls through BaseTool || 3 and still retries", async () => {
		// Adapter passes metadata.maxRetryAttempts ?? 3 (keeps 0), then BaseTool
		// applies config.maxRetryAttempts || 3 so effective max becomes 3.
		let attempts = 0;
		const callTool = vi.fn(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("closed");
			}
			return { recovered: true };
		});
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "zero_retry",
				description: "Explicit maxRetryAttempts zero for MCP adapter",
				inputSchema: { type: "object", properties: {} },
				_meta: { shouldRetryOnFailure: true, maxRetryAttempts: 0 },
			} as any,
			client: { callTool } as any,
		});

		expect(tool.maxRetryAttempts).toBe(3);
		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			recovered: true,
		});
		expect(callTool).toHaveBeenCalledTimes(3);
	});

	it("wraps non-Error closed throws without retry (non-Error is not closed-resource)", async () => {
		const callTool = vi.fn(async () => {
			throw "closed string";
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 3,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("closed string"),
			originalError: undefined,
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize"),
		);
	});

	it("retries all three closed variants in sequence across separate tools", async () => {
		const variants = ["closed", "ECONNRESET", "socket hang up"] as const;
		for (const message of variants) {
			let attempts = 0;
			const callTool = vi.fn(async () => {
				attempts++;
				if (attempts === 1) {
					throw new Error(message);
				}
				return { recovered: message };
			});
			vi.spyOn(console, "warn").mockImplementation(() => undefined);
			const tool = await makeClientTool(callTool, {
				name: `variant_${message.replace(/\s+/g, "_")}`,
				shouldRetryOnFailure: true,
				maxRetryAttempts: 1,
			});
			await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
				recovered: message,
			});
			expect(callTool).toHaveBeenCalledTimes(2);
			vi.restoreAllMocks();
		}
	});

	it("client path without callTool falls through when shouldRetryOnFailure true but no callTool", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "no_call",
				description: "Client object missing callTool method",
				inputSchema: { type: "object", properties: {} },
				_meta: { shouldRetryOnFailure: true, maxRetryAttempts: 2 },
			} as any,
			client: {} as any,
			toolHandler: async () => ({ via: "handler" }),
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			via: "handler",
		});
	});

	it("logs console.error when wrapping non-McpError from client.callTool", async () => {
		const callTool = vi.fn(async () => {
			throw new Error("hard fail");
		});
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: false,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toBeInstanceOf(
			McpError,
		);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Error executing MCP tool"),
			expect.any(Error),
		);
	});

	it("exhaustion after maxRetryAttempts 1 yields exactly two callTool invocations", async () => {
		const callTool = vi.fn(async () => {
			throw new Error("ECONNRESET");
		});
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 1,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toMatchObject({
			message: expect.stringContaining("ECONNRESET"),
		});
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it("successful first call does not warn cannot-reinitialize", async () => {
		const callTool = vi.fn(async () => ({ ok: true }));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 3,
		});

		await expect(tool.runAsync({}, makeContext())).resolves.toEqual({
			ok: true,
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining("cannot reinitialize client"),
		);
	});

	it("closed error after successful reinit-warn path still wraps original Error", async () => {
		const root = new Error("socket hang up forever");
		const callTool = vi.fn(async () => {
			throw root;
		});
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const tool = await makeClientTool(callTool, {
			shouldRetryOnFailure: true,
			maxRetryAttempts: 1,
		});

		let caught: McpError | undefined;
		try {
			await tool.runAsync({}, makeContext());
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.TOOL_EXECUTION_ERROR);
		expect(caught?.originalError).toBe(root);
		expect(callTool).toHaveBeenCalledTimes(2);
	});
});
