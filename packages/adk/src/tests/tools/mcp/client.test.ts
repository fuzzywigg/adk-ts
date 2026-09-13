import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

const connect = vi.fn();
const callTool = vi.fn();
const close = vi.fn();
const setRequestHandler = vi.fn();
const removeRequestHandler = vi.fn();
const transportClose = vi.fn();

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
	StdioClientTransport: vi.fn(function StdioClientTransport() {
		return { close: transportClose };
	}),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: vi.fn(
		function StreamableHTTPClientTransport() {
			return { close: transportClose };
		},
	),
}));

const { McpClientService } = await import("../../../tools/mcp/client");

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

function stdioConfig(overrides: Record<string, unknown> = {}) {
	return {
		name: "test-mcp",
		description: "test client for offline unit coverage",
		transport: {
			mode: "stdio" as const,
			command: "npx",
			args: ["-y", "@example/mcp"],
			env: { PATH: "/usr/bin" },
		},
		...overrides,
	};
}

describe("McpClientService.initialize", () => {
	it("connects once and returns the cached client", async () => {
		const service = new McpClientService(stdioConfig());

		const first = await service.initialize();
		const second = await service.initialize();

		expect(first).toBe(second);
		expect(connect).toHaveBeenCalledTimes(1);
		expect(service.isConnected()).toBe(true);
	});

	it("wraps non-Mcp connect failures as CONNECTION_ERROR", async () => {
		connect.mockRejectedValue(new Error("spawn failed"));
		const service = new McpClientService(stdioConfig());

		await expect(service.initialize()).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("Failed to initialize MCP client"),
		});
		expect(service.isConnected()).toBe(false);
	});

	it("rejects initialize while closing", async () => {
		const service = new McpClientService(stdioConfig());
		(service as any).isClosing = true;

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
	});

	it("times out slow connections when timeout is configured", async () => {
		connect.mockImplementation(
			() => new Promise((resolve) => setTimeout(resolve, 50)),
		);
		const service = new McpClientService(stdioConfig({ timeout: 5 }));

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
	});
});

describe("McpClientService.callTool", () => {
	it("initializes then calls the tool", async () => {
		const service = new McpClientService(stdioConfig());

		const result = await service.callTool("echo", { msg: "hi" });

		expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
		expect(callTool).toHaveBeenCalledWith({
			name: "echo",
			arguments: { msg: "hi" },
		});
	});

	it("wraps tool failures as TOOL_EXECUTION_ERROR", async () => {
		callTool.mockRejectedValue(new Error("boom"));
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining('Error calling tool "echo"'),
		});
	});

	it("rethrows existing McpError instances", async () => {
		callTool.mockRejectedValue(
			new McpError("already typed", McpErrorType.INVALID_SCHEMA_ERROR),
		);
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: "already typed",
		});
	});
});

describe("McpClientService.close / sampling handlers", () => {
	it("close clears the connected state", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		expect(service.isConnected()).toBe(true);

		await service.close();
		expect(service.isConnected()).toBe(false);
	});

	it("registers sampling handler when provided in config", async () => {
		const handler = vi.fn().mockResolvedValue("sampled");
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);

		await service.initialize();
		expect(setRequestHandler).toHaveBeenCalled();
	});

	it("setSamplingHandler and removeSamplingHandler update state", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();

		service.setSamplingHandler(vi.fn().mockResolvedValue("x"));
		expect((service as any).mcpSamplingHandler).toBeTruthy();

		service.removeSamplingHandler();
		expect((service as any).mcpSamplingHandler).toBeNull();
		expect(removeRequestHandler).toHaveBeenCalledWith("sampling/createMessage");
	});

	it("creates SSE/streamable HTTP transport with merged headers and timeout", async () => {
		const { StreamableHTTPClientTransport } = await import(
			"@modelcontextprotocol/sdk/client/streamableHttp.js"
		);
		const service = new McpClientService({
			name: "sse-client",
			description: "sse",
			transport: {
				mode: "sse",
				serverUrl: "https://mcp.example.com/sse",
				headers: { "x-transport": "1" },
			},
			headers: { Authorization: "Bearer t" },
			timeout: 1500,
		});

		await service.initialize();

		expect(StreamableHTTPClientTransport).toHaveBeenCalled();
		const [url, opts] = (StreamableHTTPClientTransport as any).mock.calls.at(
			-1,
		);
		expect(String(url)).toBe("https://mcp.example.com/sse");
		expect(opts.requestInit.headers).toEqual({
			"x-transport": "1",
			Authorization: "Bearer t",
		});
		expect(opts.requestInit.timeout).toBe(1500);
	});

	it("reinitialize cleans up and reconnects", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		expect(connect).toHaveBeenCalledTimes(1);

		await service.reinitialize();

		expect(close).toHaveBeenCalled();
		expect(transportClose).toHaveBeenCalled();
		expect(connect).toHaveBeenCalledTimes(2);
		expect(service.isConnected()).toBe(true);
	});

	it("invokes registered sampling handler and wraps non-Mcp errors", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();

		const handleSamplingRequest = vi
			.fn()
			.mockResolvedValueOnce({
				role: "assistant",
				content: { type: "text", text: "ok" },
			})
			.mockRejectedValueOnce(new Error("sample failed"));
		(service as any).mcpSamplingHandler = { handleSamplingRequest };
		await (service as any).setupSamplingHandler((service as any).client);

		const cb = setRequestHandler.mock.calls.at(-1)?.[1];
		expect(cb).toBeTypeOf("function");
		await expect(cb({ method: "sampling/createMessage" })).resolves.toEqual({
			role: "assistant",
			content: { type: "text", text: "ok" },
		});
		await expect(
			cb({ method: "sampling/createMessage" }),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("Sampling request failed"),
		});
	});

	it("rethrows McpError from sampling handler unchanged", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		(service as any).mcpSamplingHandler = {
			handleSamplingRequest: vi
				.fn()
				.mockRejectedValue(
					new McpError("typed", McpErrorType.INVALID_SCHEMA_ERROR),
				),
		};
		await (service as any).setupSamplingHandler((service as any).client);
		const cb = setRequestHandler.mock.calls.at(-1)?.[1];
		await expect(cb({})).rejects.toMatchObject({
			type: McpErrorType.INVALID_SCHEMA_ERROR,
			message: "typed",
		});
	});

	it("continues initialize when sampling handler registration throws", async () => {
		setRequestHandler.mockImplementation(() => {
			throw new Error("cannot register");
		});
		const service = new McpClientService(
			stdioConfig({ samplingHandler: vi.fn() }),
		);
		await expect(service.initialize()).resolves.toBeTruthy();
		expect(service.isConnected()).toBe(true);
	});

	it("removeSamplingHandler swallows removeRequestHandler errors", async () => {
		removeRequestHandler.mockImplementation(() => {
			throw new Error("remove failed");
		});
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		service.setSamplingHandler(vi.fn());
		expect(() => service.removeSamplingHandler()).not.toThrow();
		expect((service as any).mcpSamplingHandler).toBeNull();
	});

	it("cleanupResources ignores client.close failures and logs transport cleanup errors", async () => {
		close.mockRejectedValue(new Error("close boom"));
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		await expect(service.close()).resolves.toBeUndefined();
		expect(service.isConnected()).toBe(false);
	});
});
