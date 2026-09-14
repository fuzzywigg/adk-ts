import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

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

function stdioConfig(overrides: Record<string, unknown> = {}) {
	return {
		name: "test-mcp",
		description: "test client for offline unit coverage",
		transport: {
			mode: "stdio" as const,
			command: "npx",
			args: ["-y", "@example/mcp"],
			env: { PATH: "/usr/bin" },
		},
		...overrides,
	};
}

describe("McpClientService callTool retry orchestration leftovers", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
		StreamableHTTPClientTransport.mockClear();
		StdioClientTransport.mockImplementation(function StdioClientTransport() {
			return { close: transportClose };
		});
		StreamableHTTPClientTransport.mockImplementation(
			function StreamableHTTPClientTransport() {
				return { close: transportClose };
			},
		);
		connect.mockResolvedValue(undefined);
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		close.mockResolvedValue(undefined);
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it.each([
		1, 2, 3,
	])("exhausts closed-session retries with maxRetries=%s and wraps as TOOL_EXECUTION_ERROR", async (maxRetries) => {
		callTool.mockRejectedValue(new Error("session closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries } }),
		);

		await expect(service.callTool("echo", { q: 1 })).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining('Error calling tool "echo"'),
		});
		expect(callTool).toHaveBeenCalledTimes(maxRetries + 1);
	});

	it("falsy maxRetries 0 falls back to default 2 via || coalescing", async () => {
		callTool.mockRejectedValue(new Error("closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toBeInstanceOf(McpError);
		expect(callTool).toHaveBeenCalledTimes(3);
	});

	it.each([
		"permission denied",
		"CLOSED",
		"econnreset",
		"socket hangup",
		"invalid schema",
	])("does not retry non-retryable callTool error: %s", async (message) => {
		callTool.mockRejectedValue(new Error(message));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 3 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining(message),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it("preserves already-classified McpError through the retry wrapper without re-wrapping", async () => {
		const typed = new McpError(
			"already classified",
			McpErrorType.INVALID_SCHEMA_ERROR,
		);
		callTool.mockRejectedValue(typed);
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 4 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toBe(typed);
		expect(callTool).toHaveBeenCalledTimes(1);
	});

	it("retries ECONNRESET then surfaces a later non-retryable error", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("ECONNRESET");
			throw new Error("permission denied");
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 3 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("permission denied"),
		});
		expect(attempts).toBe(2);
		expect(connect).toHaveBeenCalledTimes(2);
	});

	it("defaults maxRetries to 2 when retryOptions.maxRetries is omitted", async () => {
		callTool.mockRejectedValue(new Error("closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { initialDelay: 1 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toBeInstanceOf(McpError);
		expect(callTool).toHaveBeenCalledTimes(3);
	});
});
