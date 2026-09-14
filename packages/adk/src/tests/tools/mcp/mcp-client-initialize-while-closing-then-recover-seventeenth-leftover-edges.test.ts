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
 * Seventeenth leftover (error path): `initialize` while `isClosing` rejects
 * with RESOURCE_CLOSED_ERROR without attempting connect — and after cleanup
 * finally clears the flag, initialize works again. Complements #220
 * isConnected truthiness without overlapping that matrix.
 */
describe("mcp-client initialize while closing then recover seventeenth leftover", () => {
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

	it("rejects initialize while closing without connect, then recovers after close finishes", async () => {
		const service = new McpClientService({
			name: "init-while-closing-17",
			description: "initialize while closing recover leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});

		(service as any).isClosing = true;
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
			message: expect.stringContaining("being closed"),
		});
		expect(connect).not.toHaveBeenCalled();
		expect(StdioClientTransport).not.toHaveBeenCalled();

		(service as any).isClosing = false;
		await expect(service.initialize()).resolves.toBeTruthy();
		expect(connect).toHaveBeenCalledTimes(1);
		expect(service.isConnected()).toBe(true);
	});
});
