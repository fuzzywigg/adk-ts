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

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

const { McpClientService } = await import("../../../tools/mcp/client");
const { McpErrorType } = await import("../../../tools/mcp/types");

/**
 * Fifteenth leftover: `retryOptions?.maxRetries || 2` — string `"0"` is
 * truthy so it does NOT fall through to 2; withRetry treats `"0"` as max
 * (one attempt, no reinit). Numeric 0 still coalesces to 2 (prior leftover).
 */
describe("mcp-client maxRetries string-zero fifteenth leftover", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		connect.mockResolvedValue(undefined);
		callTool.mockReset();
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function stdioConfig(extra: Record<string, unknown> = {}) {
		return {
			name: "maxretries-str0",
			description: "string maxRetries leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
			...extra,
		};
	}

	it('maxRetries: "0" is truthy so only one attempt (no reinit)', async () => {
		callTool.mockRejectedValue(new Error("closed"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: "0" as any } }),
		);
		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("closed"),
		});
		expect(callTool).toHaveBeenCalledTimes(1);
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it("numeric 0 still coalesces to 2 retries (control asymmetry)", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) throw new Error("closed");
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
