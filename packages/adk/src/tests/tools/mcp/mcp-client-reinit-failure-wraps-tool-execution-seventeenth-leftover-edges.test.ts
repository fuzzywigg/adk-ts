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
 * Seventeenth leftover (error path): when closed-session retry triggers
 * `reinitialize()` and reconnect fails, `withRetry` throws
 * `Failed to reinitialize resources…` which `callTool` wraps as
 * TOOL_EXECUTION_ERROR — distinct from #220 maxRetries string-zero.
 */
describe("mcp-client reinit failure wraps tool execution seventeenth leftover", () => {
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
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("wraps reinitialize connect failure as TOOL_EXECUTION_ERROR", async () => {
		let connectCount = 0;
		connect.mockImplementation(async () => {
			connectCount++;
			if (connectCount === 1) return;
			throw new Error("reconnect refused");
		});
		callTool.mockRejectedValue(new Error("session closed"));

		const service = new McpClientService({
			name: "reinit-fail-wrap-17",
			description: "reinit failure wrap leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
			retryOptions: { maxRetries: 2 },
		});

		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringMatching(
				/Error calling tool "echo".*Failed to reinitialize resources/,
			),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(connectCount).toBe(2);
		expect(service.isConnected()).toBe(false);
	});
});
