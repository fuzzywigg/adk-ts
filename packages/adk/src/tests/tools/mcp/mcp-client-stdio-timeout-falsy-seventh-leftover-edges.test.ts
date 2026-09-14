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

function stdioConfig(overrides: Record<string, unknown> = {}) {
	return {
		name: "stdio-seventh",
		transport: {
			type: "stdio" as const,
			command: "node",
			args: ["server.js"],
		},
		...overrides,
	};
}

describe("McpClientService stdio timeout falsy seventh leftover (post #158)", () => {
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

	it.each([
		{ label: "undefined (omitted)", timeout: undefined },
		{ label: "0", timeout: 0 },
		{ label: "null", timeout: null },
		{ label: "NaN", timeout: Number.NaN },
		{ label: '""', timeout: "" },
		{ label: "false", timeout: false },
	] as const)("skips Promise.race timeout path when timeout is falsy ($label)", async ({
		timeout,
	}) => {
		let resolveConnect!: () => void;
		connect.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveConnect = resolve;
				}),
		);

		const service = new McpClientService(
			stdioConfig(timeout === undefined ? {} : { timeout: timeout as any }),
		);
		const pending = service.initialize();

		await Promise.resolve();
		resolveConnect();
		await expect(pending).resolves.toBeTruthy();
		expect(connect).toHaveBeenCalledTimes(1);
	});

	it("still races and rejects when timeout is a positive number", async () => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService(stdioConfig({ timeout: 5 }));
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
		expect(McpError).toBeTypeOf("function");
	});
});
