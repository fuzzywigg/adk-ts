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
		name: "timeout-twentieth",
		transport: {
			type: "stdio" as const,
			command: "node",
			args: ["server.js"],
		},
		...overrides,
	};
}

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after thirteenth truthy
 * non-number): `if (config.timeout)` races for `"true"` / `[]` /
 * `NEGATIVE_INFINITY` (truthy near-miss); SameValueZero `-0` is falsy and
 * skips the race. Thirteenth pinned `"5"` / boolean `true` / numeric `1` only.
 */
describe("mcp client timeout true/negzero twentieth leftover", () => {
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

	it.each([
		{ label: '"true"', timeout: "true" },
		{ label: "empty array", timeout: [] as never[] },
		{ label: "NEGATIVE_INFINITY", timeout: Number.NEGATIVE_INFINITY },
	])("timeout $label is truthy and races to TIMEOUT_ERROR", async ({
		timeout,
	}) => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService(
			stdioConfig({ timeout: timeout as any }),
		);
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
	});

	it("timeout -0 is falsy and skips race (connect resolves without timeout)", async () => {
		connect.mockResolvedValue(undefined);
		const service = new McpClientService(stdioConfig({ timeout: -0 as any }));
		await expect(service.initialize()).resolves.toBeDefined();
	});
});
