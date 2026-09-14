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

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: vi.fn(),
}));

const { McpClientService } = await import("../../../tools/mcp/client");

/**
 * Fifteenth leftover: constructor `if (config.samplingHandler)` — falsy
 * values skip McpSamplingHandler; setupSamplingHandler then no-ops without
 * setRequestHandler.
 */
describe("mcp client samplingHandler falsy skip fifteenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		connect.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "null", samplingHandler: null },
		{ label: "undefined", samplingHandler: undefined },
		{ label: "0", samplingHandler: 0 },
		{ label: "false", samplingHandler: false },
		{ label: "empty string", samplingHandler: "" },
	] as const)("falsy samplingHandler ($label) skips setRequestHandler", async ({
		samplingHandler,
	}) => {
		const service = new McpClientService({
			name: "no-sample",
			samplingHandler: samplingHandler as any,
			transport: {
				mode: "stdio",
				command: "node",
				args: ["server.js"],
			},
		});
		await service.initialize();
		expect(setRequestHandler).not.toHaveBeenCalled();
		await service.close();
	});

	it("truthy function samplingHandler registers setRequestHandler (control)", async () => {
		const handler = vi.fn(async () => "ok");
		const service = new McpClientService({
			name: "with-sample",
			samplingHandler: handler as any,
			transport: {
				mode: "stdio",
				command: "node",
				args: ["server.js"],
			},
		});
		await service.initialize();
		expect(setRequestHandler).toHaveBeenCalledTimes(1);
		await service.close();
	});
});
