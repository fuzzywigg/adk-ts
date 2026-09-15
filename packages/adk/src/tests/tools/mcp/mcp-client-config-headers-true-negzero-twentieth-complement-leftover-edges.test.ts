import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
 * Twenty-first leftover (HEAVY tip-relaunch residual / twentieth complement):
 * `config.headers || {}` — twentieth matrix covered transport.headers; only
 * `config.headers: "true"` char-spread. Missing config-side `true` / `[]` /
 * `NEGATIVE_INFINITY` → `{}` no-op; `-0` → `{}`.
 */
describe("mcp client config headers true/negzero twentieth complement leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StreamableHTTPClientTransport.mockClear();
		connect.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("config.headers [] is truthy || keep and spreads to no keys", async () => {
		const service = new McpClientService({
			name: "cfg-headers-arr",
			headers: [],
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it("config.headers -0 collapses to {} via ||", async () => {
		const service = new McpClientService({
			name: "cfg-headers-neg0",
			headers: -0,
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it.each([
		{ label: "boolean true", headers: true },
		{ label: "NEGATIVE_INFINITY", headers: Number.NEGATIVE_INFINITY },
	])("config.headers $label is truthy || keep then object-spread no-op {}", async ({
		headers,
	}) => {
		const service = new McpClientService({
			name: "cfg-headers-noop",
			headers,
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});
});
