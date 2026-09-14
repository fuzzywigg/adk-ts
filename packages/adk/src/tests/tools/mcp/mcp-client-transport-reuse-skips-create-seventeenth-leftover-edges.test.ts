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

const { McpClientService } = await import("../../../tools/mcp/client");

/**
 * Seventeenth leftover (session lifecycle): `initialize` only creates a
 * transport when `!this.transport` — a pre-set transport is reused and
 * `createTransport` / StdioClientTransport is skipped.
 */
describe("mcp-client transport reuse skips create seventeenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
		connect.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("reuses preset transport and does not construct StdioClientTransport", async () => {
		const preset = { close: transportClose, kind: "preset" };
		const service = new McpClientService({
			name: "transport-reuse-17",
			description: "preset transport reuse leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});
		(service as any).transport = preset;

		await service.initialize();

		expect(StdioClientTransport).not.toHaveBeenCalled();
		expect(connect).toHaveBeenCalledTimes(1);
		expect(connect.mock.calls[0][0]).toBe(preset);
		expect(service.isConnected()).toBe(true);
	});
});
