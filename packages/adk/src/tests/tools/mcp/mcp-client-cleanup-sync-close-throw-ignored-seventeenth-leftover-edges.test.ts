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
 * Seventeenth leftover (error path): `cleanupResources` inner try/catch
 * ignores sync throws from `client.close()` (promise rejects already covered
 * in client.test) and still closes transport + clears session state.
 */
describe("mcp-client cleanup sync close throw ignored seventeenth leftover", () => {
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
		transportClose.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("sync throw from client.close is ignored; transport still closes", async () => {
		close.mockImplementation(() => {
			throw new Error("sync close boom");
		});
		const service = new McpClientService({
			name: "cleanup-sync-close-17",
			description: "sync client.close throw leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});
		await service.initialize();

		await expect(service.close()).resolves.toBeUndefined();
		expect(transportClose).toHaveBeenCalledTimes(1);
		expect(service.isConnected()).toBe(false);
		expect((service as any).client).toBeNull();
		expect((service as any).transport).toBeNull();
		expect((service as any).isClosing).toBe(false);
	});
});
