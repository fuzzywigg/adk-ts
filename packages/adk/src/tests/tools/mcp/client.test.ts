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

	it("cleanupResources logs errors from transport.close and still clears state", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();
		transportClose.mockRejectedValueOnce(new Error("transport close boom"));
		const errorSpy = vi
			.spyOn((service as any).logger, "error")
			.mockImplementation(() => {});

		await expect(service.close()).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error cleaning up MCP resources:",
			expect.any(Error),
		);
		expect((service as any).client).toBeNull();
		expect((service as any).transport).toBeNull();
		errorSpy.mockRestore();
	});

	it("sampling handler wraps non-Error throws as SAMPLING_ERROR", async () => {
		const handler = vi.fn().mockRejectedValue("string-fail");
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const registered = setRequestHandler.mock.calls[0][1];
		await expect(
			registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 8,
				},
			}),
		).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("string-fail"),
		});
	});
});

describe("McpClientService non-Error throws and SSE header edges", () => {
	it("initialize wraps non-Error connect rejection via String() without originalError", async () => {
		connect.mockRejectedValue("spawn-string-fail");
		const service = new McpClientService(stdioConfig());

		let caught: McpError | undefined;
		try {
			await service.initialize();
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught).toBeInstanceOf(McpError);
		expect(caught?.type).toBe(McpErrorType.CONNECTION_ERROR);
		expect(caught?.message).toContain("spawn-string-fail");
		expect(caught?.originalError).toBeUndefined();
		expect(service.isConnected()).toBe(false);
	});

	it("createTransport wraps non-Error construction throws via String()", async () => {
		StreamableHTTPClientTransport.mockImplementation(function Boom() {
			throw "bad-url-string";
		});
		const service = new McpClientService(sseConfig());

		let caught: McpError | undefined;
		try {
			await service.initialize();
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.CONNECTION_ERROR);
		expect(caught?.message).toContain("Failed to create transport");
		expect(caught?.message).toContain("bad-url-string");
		expect(caught?.originalError).toBeUndefined();
	});

	it("callTool wraps non-Error tool failures via String() without originalError", async () => {
		callTool.mockRejectedValue(42);
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);

		let caught: McpError | undefined;
		try {
			await service.callTool("echo", {});
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.TOOL_EXECUTION_ERROR);
		expect(caught?.message).toContain('Error calling tool "echo"');
		expect(caught?.message).toContain("42");
		expect(caught?.originalError).toBeUndefined();
	});

	it("SSE transport uses empty headers when transport.headers is omitted", async () => {
		const service = new McpClientService({
			name: "sse-bare",
			description: "sse without transport headers for headers||{} path",
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
			},
		});

		await service.initialize();

		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts).toEqual({
			requestInit: {
				headers: {},
			},
		});
	});

	it("SSE transport merges config.headers when transport.headers is undefined", async () => {
		const service = new McpClientService({
			name: "sse-cfg-headers",
			description: "sse merges top-level headers when transport headers absent",
			headers: { "X-App": "adk" },
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
			},
		});

		await service.initialize();

		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({ "X-App": "adk" });
	});

	it("sampling callback wraps raw Error with originalError set", async () => {
		const root = new Error("raw-handler-error");
		const handler = vi.fn().mockRejectedValue(root);
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const registered = setRequestHandler.mock.calls[0][1];
		let caught: McpError | undefined;
		try {
			await registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "ping" } }],
					maxTokens: 8,
				},
			});
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.SAMPLING_ERROR);
		expect(caught?.message).toContain("raw-handler-error");
		expect(caught?.originalError).toBe(root);
	});

	it("sampling callback wraps non-Error rejection without originalError", async () => {
		const handler = vi.fn().mockRejectedValue({ reason: "plain-object" });
		const service = new McpClientService(
			stdioConfig({ samplingHandler: handler }),
		);
		await service.initialize();

		const registered = setRequestHandler.mock.calls[0][1];
		let caught: McpError | undefined;
		try {
			await registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "ping" } }],
					maxTokens: 4,
				},
			});
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.SAMPLING_ERROR);
		expect(caught?.message).toContain("[object Object]");
		expect(caught?.originalError).toBeUndefined();
	});

	it("initialize wraps Error connect failures with originalError preserved", async () => {
		const root = new Error("spawn errno");
		connect.mockRejectedValue(root);
		const service = new McpClientService(stdioConfig());

		let caught: McpError | undefined;
		try {
			await service.initialize();
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.CONNECTION_ERROR);
		expect(caught?.originalError).toBe(root);
	});

	it("stdio transport construction non-Error throw uses String()", async () => {
		StdioClientTransport.mockImplementation(function Boom() {
			throw Symbol.for("stdio-fail");
		});
		const service = new McpClientService(stdioConfig());

		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("Failed to create transport"),
			originalError: undefined,
		});
	});

	it("callTool preserves originalError for Error rejections", async () => {
		const root = new Error("tool boom");
		callTool.mockRejectedValue(root);
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);

		let caught: McpError | undefined;
		try {
			await service.callTool("echo", { a: 1 });
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.TOOL_EXECUTION_ERROR);
		expect(caught?.originalError).toBe(root);
	});
});

describe("McpClientService sampling wrap and setSamplingHandler leftovers", () => {
	it("wraps non-McpError throws from handleSamplingRequest via String()", async () => {
		const service = new McpClientService(
			stdioConfig({ samplingHandler: async () => "ok" }),
		);
		await service.initialize();

		(service as any).mcpSamplingHandler.handleSamplingRequest = async () => {
			throw "raw-string-fail";
		};

		const registered = setRequestHandler.mock.calls[0][1];
		let caught: McpError | undefined;
		try {
			await registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 4,
				},
			});
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.SAMPLING_ERROR);
		expect(caught?.message).toContain("raw-string-fail");
		expect(caught?.originalError).toBeUndefined();
	});

	it("re-throws McpError from handleSamplingRequest without wrapping", async () => {
		const service = new McpClientService(
			stdioConfig({ samplingHandler: async () => "ok" }),
		);
		await service.initialize();

		const original = new McpError("already mcp", McpErrorType.SAMPLING_ERROR);
		(service as any).mcpSamplingHandler.handleSamplingRequest = async () => {
			throw original;
		};

		const registered = setRequestHandler.mock.calls[0][1];
		await expect(
			registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 4,
				},
			}),
		).rejects.toBe(original);
	});

	it("logs when setSamplingHandler update rejects after client is connected", async () => {
		const service = new McpClientService(stdioConfig());
		await service.initialize();

		const errorSpy = vi
			.spyOn((service as any).logger, "error")
			.mockImplementation(() => {});
		(service as any).setupSamplingHandler = async () => {
			throw new Error("update-fail");
		};

		service.setSamplingHandler(async () => "ok");
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(errorSpy).toHaveBeenCalledWith(
			"Failed to update ADK sampling handler:",
			expect.any(Error),
		);
		errorSpy.mockRestore();
	});

	it("wraps Error throws from handleSamplingRequest preserving originalError", async () => {
		const service = new McpClientService(
			stdioConfig({ samplingHandler: async () => "ok" }),
		);
		await service.initialize();

		const root = new Error("handler-impl-boom");
		(service as any).mcpSamplingHandler.handleSamplingRequest = async () => {
			throw root;
		};

		const registered = setRequestHandler.mock.calls[0][1];
		let caught: McpError | undefined;
		try {
			await registered({
				method: "sampling/createMessage",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 4,
				},
			});
		} catch (error) {
			caught = error as McpError;
		}

		expect(caught?.type).toBe(McpErrorType.SAMPLING_ERROR);
		expect(caught?.message).toContain("handler-impl-boom");
		expect(caught?.originalError).toBe(root);
	});
});
