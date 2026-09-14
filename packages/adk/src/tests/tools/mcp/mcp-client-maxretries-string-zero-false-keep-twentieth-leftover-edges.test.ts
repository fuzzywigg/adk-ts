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

function stdioConfig(overrides: Record<string, unknown> = {}) {
	return {
		name: "test-mcp",
		description: "test client for twentieth leftover coverage",
		transport: {
			mode: "stdio" as const,
			command: "npx",
			args: ["-y", "@example/mcp"],
			env: { PATH: "/usr/bin" },
		},
		...overrides,
	};
}

/**
 * Twentieth leftover: callTool `retryOptions?.maxRetries || 2` —
 * string "0"/"false" are truthy and do not coalesce to 2 (unlike numeric 0).
 */
describe("mcp client maxRetries string-zero/false keep twentieth leftover", () => {
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
		connect.mockResolvedValue(undefined);
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('maxRetries: "0" does not fall back to 2 — closed error exhausts immediately', async () => {
		callTool.mockRejectedValue(new Error("closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: "0" as any } }),
		);
		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("closed"),
		});
		// withRetry maxRetries="0": one attempt, then attempt >= "0" → throw (no reinit)
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it('maxRetries: "false" does not fall back to 2 — while (attempt <= "false") never enters', async () => {
		callTool.mockRejectedValue(new Error("closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: "false" as any } }),
		);
		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringMatching(/Unexpected end of retry loop|closed/),
		});
		expect(callTool).toHaveBeenCalledTimes(0);
	});

	it("numeric 0 still → 2 via || (leftover control)", async () => {
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

	it("explicit maxRetries 1 still one reinit (control)", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("closed");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 1 } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(2);
	});
});
