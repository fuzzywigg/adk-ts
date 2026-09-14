import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	connect,
	callTool,
	close,
	setRequestHandler,
	removeRequestHandler,
	transportClose,
	StdioClientTransport,
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

const { McpClientService } = await import("../../../tools/mcp/client");

/**
 * Seventeenth leftover (session lifecycle): `callTool` after `close()` must
 * re-open via `initialize()` inside the retry wrapper — not covered by #220.
 */
describe("mcp-client callTool after close reopen seventeenth leftover", () => {
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
		transportClose.mockResolvedValue(undefined);
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("callTool after close reconnects once and succeeds", async () => {
		const service = new McpClientService({
			name: "calltool-after-close-17",
			description: "callTool reopen after close leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
			retryOptions: { maxRetries: 1 },
		});

		await service.initialize();
		await service.close();
		expect(service.isConnected()).toBe(false);
		expect(connect).toHaveBeenCalledTimes(1);

		await expect(service.callTool("echo", { q: 1 })).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(service.isConnected()).toBe(true);
		expect(connect).toHaveBeenCalledTimes(2);
		expect(callTool).toHaveBeenCalledWith({
			name: "echo",
			arguments: { q: 1 },
		});
	});
});
