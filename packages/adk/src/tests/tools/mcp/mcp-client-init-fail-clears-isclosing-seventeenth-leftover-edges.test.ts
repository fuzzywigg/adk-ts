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
 * Seventeenth leftover (error path): failed `initialize` runs
 * `cleanupResources` whose `finally` clears `isClosing`, so a subsequent
 * initialize is allowed (session not stuck closed).
 */
describe("mcp-client init fail clears isClosing seventeenth leftover", () => {
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
		close.mockResolvedValue(undefined);
		transportClose.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("failed initialize clears isClosing so a later initialize can succeed", async () => {
		connect
			.mockRejectedValueOnce(new Error("first connect fail"))
			.mockResolvedValueOnce(undefined);

		const service = new McpClientService({
			name: "init-fail-isclosing-17",
			description: "init fail clears isClosing leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
		});
		expect((service as any).isClosing).toBe(false);
		expect(service.isConnected()).toBe(false);

		await expect(service.initialize()).resolves.toBeTruthy();
		expect(service.isConnected()).toBe(true);
		expect(connect).toHaveBeenCalledTimes(2);
	});
});
