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
 * Fifteenth leftover: stdio `if (this.config.timeout)` — timeout: "0" is
 * truthy so Promise.race runs; setTimeout coerces "0" → 0 → immediate reject.
 * Numeric 0 still skips the race (seventh leftover).
 */
describe("mcp client stdio timeout string-zero race fifteenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		connect.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('timeout: "0" is truthy and immediately times out hanging connect', async () => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService({
			name: "stdio-str-zero",
			timeout: "0" as any,
			transport: {
				mode: "stdio",
				command: "node",
				args: ["server.js"],
			},
		});
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
			message: expect.stringContaining("0"),
		});
	});

	it("timeout: 0 still skips race so hanging connect never rejects (control)", async () => {
		connect.mockImplementation(
			() =>
				new Promise((resolve) => {
					setTimeout(resolve, 20);
				}),
		);
		const service = new McpClientService({
			name: "stdio-num-zero",
			timeout: 0,
			transport: {
				mode: "stdio",
				command: "node",
				args: ["server.js"],
			},
		});
		await expect(service.initialize()).resolves.toBeDefined();
	});
});
