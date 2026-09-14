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
 * Twentieth leftover (HEAVY tip-relaunch residual after fourteenth falsy headers):
 * SSE `...(headers || {})` — boolean `true` / `NEGATIVE_INFINITY` are truthy
 * non-objects whose object-spread is a no-op (`{}`); `[]` spreads to no keys;
 * `"true"` spreads to char indices; SameValueZero `-0` collapses to `{}`.
 * Fourteenth pinned classic falsy + array numeric keys.
 */
describe("mcp client headers true/negzero/emptyarray twentieth leftover", () => {
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

	it("transport.headers [] is truthy || keep and spreads to no keys", async () => {
		const service = new McpClientService({
			name: "headers-arr",
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
				headers: [],
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it("transport.headers -0 collapses to {} via ||", async () => {
		const service = new McpClientService({
			name: "headers-neg0",
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
				headers: -0,
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it.each([
		{ label: "boolean true", headers: true },
		{ label: "NEGATIVE_INFINITY", headers: Number.NEGATIVE_INFINITY },
	])("transport.headers $label is truthy || keep then object-spread no-op {}", async ({
		headers,
	}) => {
		const service = new McpClientService({
			name: "headers-noop",
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
				headers,
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it('config.headers "true" is truthy || keep then spreads as string indices', async () => {
		const service = new McpClientService({
			name: "headers-str-true",
			headers: "true",
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({
			0: "t",
			1: "r",
			2: "u",
			3: "e",
		});
	});
});
