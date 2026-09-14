import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

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

beforeEach(() => {
	connect.mockReset();
	callTool.mockReset();
	close.mockReset();
	setRequestHandler.mockReset();
	removeRequestHandler.mockReset();
	transportClose.mockReset();
	StdioClientTransport.mockClear();
	StreamableHTTPClientTransport.mockClear();
	StdioClientTransport.mockImplementation(function StdioClientTransport() {
		return { close: transportClose };
	});
	StreamableHTTPClientTransport.mockImplementation(
		function StreamableHTTPClientTransport() {
			return { close: transportClose };
		},
	);
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

function sseConfig(overrides: Record<string, unknown> = {}) {
	return {
		name: "sse-mcp",
		description: "sse client for offline unit coverage path",
		transport: {
			mode: "sse" as const,
			serverUrl: "https://mcp.example.com/sse",
			headers: { Authorization: "Bearer t" },
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

	it("rethrows McpError from connect without wrapping", async () => {
		connect.mockRejectedValue(
			new McpError("typed fail", McpErrorType.TIMEOUT_ERROR),
		);
		const service = new McpClientService(stdioConfig());

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
			message: "typed fail",
		});
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

	it("creates SSE transport with merged headers and timeout", async () => {
		const service = new McpClientService(
			sseConfig({
				headers: { "X-Extra": "1" },
				timeout: 1500,
			}),
		);

		await service.initialize();

		expect(StreamableHTTPClientTransport).toHaveBeenCalledTimes(1);
		const [url, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(url).toBeInstanceOf(URL);
		expect(String(url)).toBe("https://mcp.example.com/sse");
		expect(opts).toEqual({
			requestInit: {
				headers: {
					Authorization: "Bearer t",
					"X-Extra": "1",
				},
				timeout: 1500,
			},
		});
		expect(StdioClientTransport).not.toHaveBeenCalled();
	});

	it("creates stdio transport with command, args, and env", async () => {
		const service = new McpClientService(stdioConfig());

		await service.initialize();

		expect(StdioClientTransport).toHaveBeenCalledTimes(1);
		expect(StdioClientTransport).toHaveBeenCalledWith({
			command: "npx",
			args: ["-y", "@example/mcp"],
			env: { PATH: "/usr/bin" },
		});
		expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();
	});

	it("wraps transport construction failures", async () => {
		StreamableHTTPClientTransport.mockImplementation(function Boom() {
			throw new Error("bad url");
		});
		const service = new McpClientService(sseConfig());

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("Failed to create transport"),
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

	it("retries after closed-session errors via reinitialize", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("session closed");
			}
			return { content: [{ type: "text", text: "recovered" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 1 } }),
		);

		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "recovered" }],
		});
		expect(attempts).toBe(2);
		expect(connect).toHaveBeenCalledTimes(2);
	});
});

describe("McpClientService.reinitialize / close / sampling handlers", () => {
	it("reinitialize cleans and reconnects", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		expect(connect).toHaveBeenCalledTimes(1);

		await service.reinitialize();
		expect(connect).toHaveBeenCalledTimes(2);
		expect(service.isConnected()).toBe(true);
	});

	it("close clears the connected state and swallows client close errors", async () => {
		close.mockRejectedValue(new Error("already closed"));
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		expect(service.isConnected()).toBe(true);

		await expect(service.close()).resolves.toBeUndefined();
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

	it("invokes registered sampling handler and wraps unknown errors", async () => {
		const handler = vi
			.fn()
			.mockResolvedValueOnce("ok-sample")
			.mockRejectedValueOnce(new Error("handler boom"));
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const registered = setRequestHandler.mock.calls[0][1];
		const validRequest = {
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "ping" } }],
				maxTokens: 8,
			},
		};

		await expect(registered(validRequest)).resolves.toMatchObject({
			role: "assistant",
			content: { type: "text", text: "ok-sample" },
		});

		await expect(registered(validRequest)).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("handler boom"),
		});
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

	it("removeSamplingHandler swallows removeRequestHandler errors", async () => {
		removeRequestHandler.mockImplementation(() => {
			throw new Error("cannot remove");
		});
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		service.setSamplingHandler(vi.fn().mockResolvedValue("x"));

		expect(() => service.removeSamplingHandler()).not.toThrow();
		expect((service as any).mcpSamplingHandler).toBeNull();
	});

	it("setupSamplingHandler continues when setRequestHandler throws", async () => {
		setRequestHandler.mockImplementation(() => {
			throw new Error("schema register failed");
		});
		const service = new McpClientService(
			stdioConfig({ samplingHandler: vi.fn().mockResolvedValue("x") }),
		);

		await expect(service.initialize()).resolves.toBeTruthy();
		expect(service.isConnected()).toBe(true);
	});

	it("rethrows McpError from sampling callback unchanged", async () => {
		const handler = vi
			.fn()
			.mockRejectedValue(
				new McpError("typed sampling", McpErrorType.INVALID_REQUEST_ERROR),
			);
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const registered = setRequestHandler.mock.calls[0][1];
		const validRequest = {
			method: "sampling/createMessage",
			params: {
				messages: [{ role: "user", content: { type: "text", text: "ping" } }],
				maxTokens: 8,
			},
		};

		await expect(registered(validRequest)).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
			message: "typed sampling",
		});
	});

	it("isConnected is false while closing even if client is set", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		expect(service.isConnected()).toBe(true);
		(service as any).isClosing = true;
		expect(service.isConnected()).toBe(false);
	});

	it("cleanupResources tolerates missing close methods", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		(service as any).client = { connected: true };
		(service as any).transport = { kind: "noop" };

		await expect(service.close()).resolves.toBeUndefined();
		expect(service.isConnected()).toBe(false);
		expect((service as any).client).toBeNull();
		expect((service as any).transport).toBeNull();
	});

	it("setSamplingHandler logs when setupSamplingHandler fails after connect", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();

		setRequestHandler.mockImplementation(() => {
			throw new Error("late register fail");
		});
		const errorSpy = vi
			.spyOn((service as any).logger, "error")
			.mockImplementation(() => {});

		service.setSamplingHandler(vi.fn().mockResolvedValue("late"));
		await vi.waitFor(() => {
			expect(errorSpy).toHaveBeenCalledWith(
				"Failed to setup sampling handler:",
				expect.any(Error),
			);
		});
		errorSpy.mockRestore();
	});

	it("logs cleanup errors when transport.close throws", async () => {
		transportClose.mockRejectedValue(new Error("transport close boom"));
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		const errorSpy = vi
			.spyOn((service as any).logger, "error")
			.mockImplementation(() => {});

		await expect(service.close()).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error cleaning up MCP resources:",
			expect.any(Error),
		);
		expect(service.isConnected()).toBe(false);
		errorSpy.mockRestore();
	});

	it("wraps non-Error connect failures via String(error)", async () => {
		connect.mockRejectedValue("connect-string-boom");
		const service = new McpClientService(stdioConfig());

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("connect-string-boom"),
			originalError: undefined,
		});
	});

	it("wraps non-Error transport construction failures via String(error)", async () => {
		StreamableHTTPClientTransport.mockImplementation(function Boom() {
			throw "bad-url-string";
		});
		const service = new McpClientService(sseConfig());

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("bad-url-string"),
			originalError: undefined,
		});
	});

	it("creates SSE transport without timeout when timeout is unset", async () => {
		const service = new McpClientService(sseConfig());
		await service.initialize();

		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.timeout).toBeUndefined();
		expect(opts.requestInit.headers).toEqual({
			Authorization: "Bearer t",
		});
	});

	it("creates SSE transport with empty headers when none provided", async () => {
		const service = new McpClientService({
			name: "sse-bare",
			description: "sse without headers",
			transport: {
				mode: "sse",
				serverUrl: "https://mcp.example.com/mcp",
			},
		});
		await service.initialize();

		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it("connects successfully when timeout is configured but connect is faster", async () => {
		connect.mockResolvedValue(undefined);
		const service = new McpClientService(stdioConfig({ timeout: 5000 }));
		await expect(service.initialize()).resolves.toBeTruthy();
		expect(service.isConnected()).toBe(true);
	});

	it("wraps non-Error callTool failures via String(error)", async () => {
		callTool.mockRejectedValue("tool-string-boom");
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);

		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("tool-string-boom"),
			originalError: undefined,
		});
	});

	it("defaults maxRetries to 2 when retryOptions is omitted", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("closed");
			}
			return { content: [{ type: "text", text: "recovered" }] };
		});
		const service = new McpClientService(stdioConfig());

		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "recovered" }],
		});
		expect(attempts).toBe(3);
	});

	it("logs when no sampling handler is configured at initialize", async () => {
		const service = new McpClientService(stdioConfig());
		const debugSpy = vi
			.spyOn((service as any).logger, "debug")
			.mockImplementation(() => {});

		await service.initialize();

		expect(debugSpy).toHaveBeenCalledWith(
			expect.stringContaining("No sampling handler provided"),
		);
		expect(setRequestHandler).not.toHaveBeenCalled();
		debugSpy.mockRestore();
	});

	it("wraps non-McpError thrown by handleSamplingRequest in the registered callback", async () => {
		const handler = vi.fn().mockResolvedValue("ok");
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const samplingHandler = (service as any).mcpSamplingHandler;
		vi.spyOn(samplingHandler, "handleSamplingRequest").mockRejectedValue(
			new Error("raw handler failure"),
		);

		const registered = setRequestHandler.mock.calls[0][1];
		await expect(
			registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "ping" } }],
					maxTokens: 8,
				},
			}),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("raw handler failure"),
		});
	});

	it("wraps non-Error sampling callback failures via String(error)", async () => {
		const handler = vi.fn().mockResolvedValue("ok");
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const samplingHandler = (service as any).mcpSamplingHandler;
		vi.spyOn(samplingHandler, "handleSamplingRequest").mockRejectedValue(
			"string-sampling-fail",
		);

		const registered = setRequestHandler.mock.calls[0][1];
		await expect(
			registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "ping" } }],
					maxTokens: 8,
				},
			}),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("string-sampling-fail"),
			originalError: undefined,
		});
	});

	it("setSamplingHandler before initialize stores handler without registering", () => {
		const service = new McpClientService(stdioConfig());
		service.setSamplingHandler(vi.fn().mockResolvedValue("early"));
		expect((service as any).mcpSamplingHandler).toBeTruthy();
		expect(setRequestHandler).not.toHaveBeenCalled();
	});

	it("removeSamplingHandler before initialize is a no-op on the client", () => {
		const service = new McpClientService(
			stdioConfig({ samplingHandler: vi.fn() }),
		);
		expect(() => service.removeSamplingHandler()).not.toThrow();
		expect((service as any).mcpSamplingHandler).toBeNull();
		expect(removeRequestHandler).not.toHaveBeenCalled();
	});

	it("setSamplingHandler catch logs when setupSamplingHandler promise rejects", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();

		vi.spyOn(service as any, "setupSamplingHandler").mockRejectedValue(
			new Error("update reject"),
		);
		const errorSpy = vi
			.spyOn((service as any).logger, "error")
			.mockImplementation(() => {});

		service.setSamplingHandler(vi.fn().mockResolvedValue("x"));
		await vi.waitFor(() => {
			expect(errorSpy).toHaveBeenCalledWith(
				"Failed to update ADK sampling handler:",
				expect.any(Error),
			);
		});
		errorSpy.mockRestore();
	});

	it("stdio transport omits env when not provided", async () => {
		const service = new McpClientService({
			name: "stdio-no-env",
			description: "stdio without env",
			transport: {
				mode: "stdio",
				command: "node",
				args: ["server.js"],
			},
		});
		await service.initialize();
		expect(StdioClientTransport).toHaveBeenCalledWith({
			command: "node",
			args: ["server.js"],
			env: undefined,
		});
	});

	it("reinitialize after close reconnects cleanly", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		await service.close();
		expect(service.isConnected()).toBe(false);

		await service.reinitialize();
		expect(service.isConnected()).toBe(true);
		expect(connect).toHaveBeenCalledTimes(2);
	});
});
