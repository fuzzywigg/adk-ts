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
 * Seventeenth leftover (session lifecycle): `removeRequestHandler?.(...)`
 * optional-call — when the connected client omits `removeRequestHandler`,
 * `removeSamplingHandler` still clears local handler state without throwing.
 */
describe("mcp-client remove handler missing method seventeenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
		StdioClientTransport.mockImplementation(function StdioClientTransport() {
			return { close: transportClose };
		});
		connect.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("removeSamplingHandler tolerates client without removeRequestHandler", async () => {
		const service = new McpClientService({
			name: "remove-missing-17",
			description: "missing removeRequestHandler leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});
		await service.initialize();
		service.setSamplingHandler(async () => "x");
		expect((service as any).mcpSamplingHandler).toBeTruthy();

		(service as any).client = {
			close,
			callTool,
			connect,
			setRequestHandler,
		};

		expect(() => service.removeSamplingHandler()).not.toThrow();
		expect((service as any).mcpSamplingHandler).toBeNull();
		expect(removeRequestHandler).not.toHaveBeenCalled();
	});
});
