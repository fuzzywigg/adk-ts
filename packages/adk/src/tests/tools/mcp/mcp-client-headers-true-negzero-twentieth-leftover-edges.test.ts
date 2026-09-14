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
 * Twentieth leftover: fourteenth pins falsy headers → {} and array index
 * spread. Boolean `true` is truthy non-iterable so `{...true}` → {};
 * `"true"` spreads like an array of chars; SameValueZero `-0` → `|| {}`.
 */
describe("mcp client headers true/negzero twentieth leftover", () => {
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

	it("boolean true transport.headers spreads to {} (truthy non-iterable)", async () => {
		const service = new McpClientService({
			name: "hdr-true",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: true as any,
			},
			headers: { "X-Cfg": "1" },
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Cfg": "1" });
	});

	it('string "true" transport.headers spreads to char index keys', async () => {
		const service = new McpClientService({
			name: "hdr-str-true",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: "true" as any,
			},
			headers: { "X-Cfg": "1" },
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ 0: "t", 1: "r", 2: "u", 3: "e", "X-Cfg": "1" });
	});

	it("SameValueZero -0 transport.headers coalesces via || {}", async () => {
		const service = new McpClientService({
			name: "hdr-neg0",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: -0 as any,
			},
			headers: { "X-Cfg": "1" },
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Cfg": "1" });
	});

	it("boolean true config.headers yields only transport map", async () => {
		const service = new McpClientService({
			name: "cfg-true",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: { "X-Transport": "t" },
			},
			headers: true as any,
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Transport": "t" });
	});

	it('string "true" config.headers merges char indices onto transport map', async () => {
		const service = new McpClientService({
			name: "cfg-str-true",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: { "X-Transport": "t" },
			},
			headers: "true" as any,
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Transport": "t", 0: "t", 1: "r", 2: "u", 3: "e" });
	});

	it("SameValueZero -0 config.headers coalesces via || {}", async () => {
		const service = new McpClientService({
			name: "cfg-neg0",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: { "X-Transport": "t" },
			},
			headers: -0 as any,
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Transport": "t" });
	});
});
