import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpErrorType } from "../../../tools/mcp/types";

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
		name: "timeout-thirteenth",
		transport: {
			type: "stdio" as const,
			command: "node",
			args: ["server.js"],
		},
		...overrides,
	};
}

/**
 * Thirteenth leftover: seventh leftover covered falsy timeout skip; truthy
 * non-numbers still enter Promise.race ("5" / true coerce via setTimeout).
 */
describe("mcp client timeout truthy non-number thirteenth leftover", () => {
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

	it('timeout: "5" is truthy and still races (string coerces in setTimeout)', async () => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService(stdioConfig({ timeout: "5" as any }));
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
	});

	it("timeout: true is truthy and races with coerced delay", async () => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService(stdioConfig({ timeout: true as any }));
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
	});

	it("timeout: 1 still times out a hanging connect (control)", async () => {
		connect.mockImplementation(() => new Promise(() => {}));
		const service = new McpClientService(stdioConfig({ timeout: 1 }));
		await expect(service.initialize()).rejects.toMatchObject({
			type: McpErrorType.TIMEOUT_ERROR,
		});
	});
});
