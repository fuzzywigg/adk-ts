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
 * Fourteenth leftover: SSE header merge uses `...(headers || {})` — falsy
 * non-nullish values collapse; arrays spread to numeric keys.
 */
describe("mcp client headers falsy and array spread fourteenth leftover", () => {
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
		{ label: "0", headers: 0 },
		{ label: "false", headers: false },
		{ label: "empty string", headers: "" },
	])("falsy transport.headers ($label) coalesces to {}", async ({
		headers,
	}) => {
		const service = new McpClientService({
			name: "hdr-falsy",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: headers as any,
			},
			headers: { "X-Cfg": "1" },
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Cfg": "1" });
	});

	it("array transport.headers spreads to numeric keys", async () => {
		const service = new McpClientService({
			name: "hdr-array",
			transport: {
				mode: "sse",
				serverUrl: "http://127.0.0.1:9",
				headers: ["Authorization"] as any,
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ 0: "Authorization" });
	});
});
