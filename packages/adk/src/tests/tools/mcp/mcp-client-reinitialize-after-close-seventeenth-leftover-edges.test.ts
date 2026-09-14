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
 * Seventeenth leftover (session lifecycle): `reinitialize()` after `close()`
 * must fully tear down then reconnect — distinct from #220 isConnected /
 * maxRetries string-zero leftovers.
 */
describe("mcp-client reinitialize after close seventeenth leftover", () => {
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
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function stdioConfig() {
		return {
			name: "reinit-after-close-17",
			description: "reinitialize after close session lifecycle leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		};
	}

	it("reinitialize after close reconnects and reports connected", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		expect(service.isConnected()).toBe(true);
		expect(connect).toHaveBeenCalledTimes(1);

		await service.close();
		expect(service.isConnected()).toBe(false);
		expect(close).toHaveBeenCalled();
		expect(transportClose).toHaveBeenCalled();

		await service.reinitialize();
		expect(service.isConnected()).toBe(true);
		expect(connect).toHaveBeenCalledTimes(2);
		expect(StdioClientTransport).toHaveBeenCalledTimes(2);
	});
});
