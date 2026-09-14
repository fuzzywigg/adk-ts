import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpErrorType } from "../../../tools/mcp/types";

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
 * Fifteenth leftover: `timeout: "0"` is truthy so Promise.race runs;
 * setTimeout(..., "0") fires immediately → TIMEOUT_ERROR.
 * Numeric 0 skips race (seventh leftover).
 */
describe("mcp client connect timeout string-zero race fifteenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		connect.mockResolvedValue(undefined);
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('timeout: "0" races and times out immediately', async () => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService({
			name: "timeout-str0",
			description: "string zero timeout",
			transport: {
				mode: "stdio" as const,
				command: "node",
				args: ["server.js"],
			},
			timeout: "0" as any,
		});
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
	});

	it("numeric timeout 0 still skips race (control)", async () => {
		connect.mockImplementation(() => new Promise((r) => setTimeout(r, 5)));
		const service = new McpClientService({
			name: "timeout-num0",
			description: "numeric zero timeout",
			transport: {
				mode: "stdio" as const,
				command: "node",
				args: ["server.js"],
			},
			timeout: 0,
		});
		await expect(service.initialize()).resolves.toBeDefined();
	});
});
