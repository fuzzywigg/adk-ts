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
		name: "maxretries-20",
		transport: {
			mode: "stdio" as const,
			command: "node",
			args: ["server.js"],
		},
		...overrides,
	};
}

/**
 * Twentieth leftover: leftover edges pin maxRetries `0`/null → `|| 2`.
 * Boolean `true` / `"true"` are truthy so they are used as attempt caps
 * (coerced in numeric compare); SameValueZero `-0` still falls to 2.
 */
describe("mcp client maxRetries true/negzero twentieth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		connect.mockResolvedValue(undefined);
		callTool.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("maxRetries boolean true is truthy; attempt >= true stops after first retry fail", async () => {
		callTool.mockRejectedValue(new Error("closed forever"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: true as any } }),
		);
		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
		});
		// withRetry: attempt 0 fail → reinit; attempt 1 >= true → throw (2 calls)
		expect(callTool).toHaveBeenCalledTimes(2);
	});

	it('maxRetries "true" is truthy via || but ToNumber("true") is NaN so while never enters', async () => {
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: "true" as any } }),
		);
		await expect(service.callTool("echo", {})).rejects.toThrow(
			/Unexpected end of retry loop/,
		);
		expect(callTool).not.toHaveBeenCalled();
	});

	it("maxRetries SameValueZero -0 still coalesces to || 2", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("closed");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: -0 as any } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(3);
	});
});
