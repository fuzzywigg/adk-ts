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
 * Fifteenth leftover: `retryOptions?.maxRetries || 2` — string `"0"` is
 * truthy so it is NOT replaced by 2 (unlike numeric 0, already covered).
 * Coercion then makes `attempt <= "0"` a single attempt with no reinit.
 */
describe("mcp client maxRetries string-zero truthy fifteenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
		StreamableHTTPClientTransport.mockClear();
		connect.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function stdioConfig(overrides: Record<string, unknown> = {}) {
		return {
			name: "maxretries-str-zero",
			description: "string zero maxRetries leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
				env: { PATH: "/usr/bin" },
			},
			...overrides,
		};
	}

	it('maxRetries: "0" is truthy under || so closed errors do not reinit', async () => {
		callTool.mockRejectedValue(new Error("session closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: "0" as any } }),
		);
		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("session closed"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it("numeric maxRetries: 0 still falls through || 2 (control)", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("closed");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(3);
	});
});
