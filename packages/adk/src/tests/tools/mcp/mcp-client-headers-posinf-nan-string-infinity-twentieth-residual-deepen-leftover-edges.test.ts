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
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed #278 onto tip; complements #259 true/negzero headers):
 * SSE `...(headers || {})` — POSITIVE_INFINITY / `1` / `Object(true)` →
 * object-spread no-op `{}`; `NaN` collapses to `{}`; `"Infinity"` spreads
 * char indices (sibling of twentieth `"true"`).
 */
describe("mcp client headers posinf/nan/string-infinity twentieth residual deepen", () => {
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

	it.each([
		{ label: "POSITIVE_INFINITY", headers: Number.POSITIVE_INFINITY },
		{ label: "number 1", headers: 1 },
		{ label: "Object(true)", headers: Object(true) },
	])("transport.headers $label is truthy || keep then object-spread no-op {}", async ({
		headers,
	}) => {
		const service = new McpClientService({
			name: "headers-residual-noop",
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

	it("transport.headers NaN collapses to {} via ||", async () => {
		const service = new McpClientService({
			name: "headers-nan",
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
				headers: Number.NaN,
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it('config.headers "Infinity" is truthy || keep then spreads as string indices', async () => {
		const service = new McpClientService({
			name: "headers-str-infinity",
			headers: "Infinity",
			transport: {
				mode: "sse",
				serverUrl: "https://example.com/mcp",
			},
		} as any);
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({
			0: "I",
			1: "n",
			2: "f",
			3: "i",
			4: "n",
			5: "i",
			6: "t",
			7: "y",
		});
	});
});
