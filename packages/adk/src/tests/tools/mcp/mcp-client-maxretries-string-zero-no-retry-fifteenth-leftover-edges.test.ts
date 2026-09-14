import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	connect,
	callTool,
	close,
	setRequestHandler,
	removeRequestHandler,
	transportClose,
	StdioClientTransport,
	StreamableHTTPClientTransport,
} = vi.hoisted(() => {
	const transportClose = vi.fn();
	return {
		connect: vi.fn(),
		callTool: vi.fn(),
		close: vi.fn(),
		setRequestHandler: vi.fn(),
		removeRequestHandler: vi.fn(),
		transportClose,
		StdioClientTransport: vi.fn(function StdioClientTransport() {
			return { close: transportClose };
		}),
		StreamableHTTPClientTransport: vi.fn(
			function StreamableHTTPClientTransport() {
				return { close: transportClose };
			},
		),
	};
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: vi.fn(function Client() {
		return {
			connect,
			callTool,
			close,
			setRequestHandler,
			removeRequestHandler,
		};
	}),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
	StdioClientTransport,
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport,
}));

const { McpClientService } = await import("../../../tools/mcp/client");

/**
 * Fifteenth leftover: `maxRetries || 2` — string "0" is truthy so withRetry
 * gets maxRetries "0"; attempt>= "0" aborts on first closed error (no reinit).
 */
describe("mcp client maxRetries string-zero no-retry fifteenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
		StdioClientTransport.mockImplementation(function StdioClientTransport() {
			return { close: transportClose };
		});
		connect.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('maxRetries: "0" does not retry on closed error', async () => {
		callTool.mockRejectedValueOnce(new Error("connection closed"));
		const service = new McpClientService({
			name: "retry-str0",
			description: "string zero maxRetries",
			transport: {
				mode: "stdio" as const,
				command: "node",
				args: ["server.js"],
			},
			retryOptions: { maxRetries: "0" as any },
		});
		await service.initialize();
		const client = await service.initialize();
		await expect((service as any).callTool("t", {})).rejects.toThrow(
			/closed|TOOL_EXECUTION|Failed|Error/,
		);
		// only the failing call — no successful retry path
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(client).toBeDefined();
	});

	it("maxRetries: 1 still retries once on closed (control)", async () => {
		callTool
			.mockRejectedValueOnce(new Error("connection closed"))
			.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });
		const service = new McpClientService({
			name: "retry-one",
			description: "numeric maxRetries 1",
			transport: {
				mode: "stdio" as const,
				command: "node",
				args: ["server.js"],
			},
			retryOptions: { maxRetries: 1 },
		});
		await service.initialize();
		const result = await (service as any).callTool("t", {});
		expect(result.content[0].text).toBe("ok");
		expect(callTool).toHaveBeenCalledTimes(2);
	});
});
