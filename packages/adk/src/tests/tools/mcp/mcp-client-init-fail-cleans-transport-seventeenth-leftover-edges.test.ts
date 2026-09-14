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

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

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
 * Seventeenth leftover (error path): connect failure after transport create
 * still invokes transport.close during cleanup and leaves session disconnected.
 */
describe("mcp-client init fail cleans transport seventeenth leftover", () => {
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
		transportClose.mockResolvedValue(undefined);
		connect.mockRejectedValue(new Error("spawn failed after transport"));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("failed connect closes the created transport and nulls session fields", async () => {
		const service = new McpClientService({
			name: "init-fail-transport-clean-17",
			description: "init fail cleans transport leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("spawn failed after transport"),
		});

		expect(StdioClientTransport).toHaveBeenCalledTimes(1);
		expect(transportClose).toHaveBeenCalledTimes(1);
		expect((service as any).client).toBeNull();
		expect((service as any).transport).toBeNull();
		expect(service.isConnected()).toBe(false);
	});
});
