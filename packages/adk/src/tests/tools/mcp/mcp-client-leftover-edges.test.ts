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
		description: "test client for leftover edge coverage",
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
		description: "sse client for leftover edge coverage",
		transport: {
			mode: "sse" as const,
			serverUrl: "https://mcp.example.com/sse",
			headers: { Authorization: "Bearer t" },
		},
		...overrides,
	};
}

describe("McpClientService leftover: headers || {}", () => {
	it("uses {} when both transport.headers and config.headers are omitted", async () => {
		const service = new McpClientService({
			name: "sse-no-headers",
			description: "headers||{} both omitted",
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
			},
		});
		await service.initialize();
		const [, opts] = StreamableHTTPClientTransport.mock.calls[0];
		expect(opts.requestInit.headers).toEqual({});
	});

	it("uses {} when transport.headers is explicitly undefined", async () => {
		const service = new McpClientService({
			name: "sse-undef-headers",
			description: "transport.headers undefined",
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: undefined,
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({});
	});

	it("merges empty transport.headers object with config.headers", async () => {
		const service = new McpClientService({
			name: "sse-empty-transport-headers",
			description: "empty transport headers object",
			headers: { "X-A": "1" },
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: {},
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-A": "1" });
	});

	it("config.headers overwrite same-key transport.headers via spread order", async () => {
		const service = new McpClientService({
			name: "sse-override",
			description: "spread override",
			headers: { Authorization: "from-config", "X-Extra": "c" },
			transport: {
				mode: "sse" as const,
				serverUrl: "https://mcp.example.com/sse",
				headers: { Authorization: "from-transport" },
			},
		});
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({
			Authorization: "from-config",
			"X-Extra": "c",
		});
	});

	const nullishHeaderCases = [
		{ label: "null config.headers", headers: null },
		{ label: "undefined config.headers", headers: undefined },
	] as const;

	for (const { label, headers } of nullishHeaderCases) {
		it(`SSE ${label} still applies transport.headers via || {}`, async () => {
			const service = new McpClientService({
				name: "sse-nullish-cfg",
				description: label,
				headers: headers as any,
				transport: {
					mode: "sse" as const,
					serverUrl: "https://mcp.example.com/sse",
					headers: { "X-T": "1" },
				},
			});
			await service.initialize();
			expect(
				StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
			).toEqual({ "X-T": "1" });
		});
	}

	it("omitted transport.headers with only config.headers yields config map", async () => {
		const service = new McpClientService(
			sseConfig({
				headers: { "X-Only": "cfg" },
				transport: {
					mode: "sse" as const,
					serverUrl: "https://mcp.example.com/sse",
				},
			}),
		);
		await service.initialize();
		expect(
			StreamableHTTPClientTransport.mock.calls[0][1].requestInit.headers,
		).toEqual({ "X-Only": "cfg" });
	});
});

describe("McpClientService leftover: maxRetries || 2", () => {
	it("defaults to 2 retries when retryOptions is omitted (closed-session)", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("session closed");
			}
			return { content: [{ type: "text", text: "recovered" }] };
		});
		const service = new McpClientService(stdioConfig());
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "recovered" }],
		});
		expect(attempts).toBe(3);
		expect(connect).toHaveBeenCalledTimes(3);
	});

	it("defaults to 2 when retryOptions exists but maxRetries is undefined", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("ECONNRESET");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { initialDelay: 1 } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(3);
	});

	it("defaults to 2 when maxRetries is null (falsy || 2)", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("socket hang up");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: null as any } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(3);
	});

	it("maxRetries 0 is falsy so || 2 still allows two reinitializations", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts <= 2) {
				throw new Error("closed");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 0 } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(3);
	});

	it("explicit maxRetries 1 only reinitializes once", async () => {
		let attempts = 0;
		callTool.mockImplementation(async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error("closed");
			}
			return { content: [{ type: "text", text: "ok" }] };
		});
		const service = new McpClientService(
			stdioConfig({ retryOptions: { maxRetries: 1 } }),
		);
		await expect(service.callTool("echo", {})).resolves.toEqual({
			content: [{ type: "text", text: "ok" }],
		});
		expect(attempts).toBe(2);
	});

	it("exhausted default maxRetries=2 rethrows closed error", async () => {
		callTool.mockRejectedValue(new Error("closed forever"));
		const service = new McpClientService(stdioConfig());
		await expect(service.callTool("echo", {})).rejects.toMatchObject({
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("closed forever"),
		});
		expect(callTool).toHaveBeenCalledTimes(3);
	});
});

describe("McpClientService leftover: non-Error → String(error) wrap", () => {
	const nonErrors: Array<{ label: string; value: unknown; contains: string }> =
		[
			{
				label: "string",
				value: "plain-string-fail",
				contains: "plain-string-fail",
			},
			{ label: "number", value: 404, contains: "404" },
			{ label: "boolean", value: true, contains: "true" },
			{ label: "null", value: null, contains: "null" },
			{ label: "undefined", value: undefined, contains: "undefined" },
			{
				label: "object",
				value: { code: "X" },
				contains: "[object Object]",
			},
			{ label: "array", value: ["a", "b"], contains: "a,b" },
			{ label: "symbol", value: Symbol.for("mcp"), contains: "Symbol(mcp)" },
			{ label: "bigint", value: BigInt(9), contains: "9" },
		];

	for (const { label, value, contains } of nonErrors) {
		it(`initialize wraps non-Error ${label} via String() without originalError`, async () => {
			connect.mockRejectedValue(value);
			const service = new McpClientService(stdioConfig());
			let caught: McpError | undefined;
			try {
				await service.initialize();
			} catch (error) {
				caught = error as McpError;
			}
			expect(caught?.type).toBe(McpErrorType.CONNECTION_ERROR);
			expect(caught?.message).toContain(contains);
			expect(caught?.originalError).toBeUndefined();
		});
	}

	for (const { label, value, contains } of nonErrors) {
		it(`callTool wraps non-Error ${label} via String() without originalError`, async () => {
			callTool.mockRejectedValue(value);
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
			expect(caught?.message).toContain(contains);
			expect(caught?.originalError).toBeUndefined();
		});
	}

	for (const { label, value, contains } of nonErrors.slice(0, 5)) {
		it(`createTransport wraps non-Error ${label} throw via String()`, async () => {
			StreamableHTTPClientTransport.mockImplementation(function Boom() {
				throw value;
			});
			const service = new McpClientService(sseConfig());
			await expect(service.initialize()).rejects.toMatchObject({
				type: McpErrorType.CONNECTION_ERROR,
				message: expect.stringContaining(contains),
				originalError: undefined,
			});
		});
	}

	it("sampling callback wraps non-Error rejection via String()", async () => {
		const handler = vi.fn().mockRejectedValue("sample-string-fail");
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
					maxTokens: 4,
				},
			}),
		).rejects.toMatchObject({
			type: McpErrorType.SAMPLING_ERROR,
			message: expect.stringContaining("sample-string-fail"),
			originalError: undefined,
		});
	});
});
