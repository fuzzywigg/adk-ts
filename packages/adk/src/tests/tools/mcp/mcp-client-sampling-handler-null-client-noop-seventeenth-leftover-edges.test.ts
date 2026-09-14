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
 * Seventeenth leftover (session lifecycle): sampling handler mutate paths when
 * `this.client` is null — set stores handler without setup; remove is a no-op
 * for removeRequestHandler.
 */
describe("mcp-client sampling handler null client noop seventeenth leftover", () => {
	beforeEach(() => {
		connect.mockReset();
		callTool.mockReset();
		close.mockReset();
		setRequestHandler.mockReset();
		removeRequestHandler.mockReset();
		transportClose.mockReset();
		StdioClientTransport.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("setSamplingHandler with null client stores handler without setRequestHandler", () => {
		const service = new McpClientService({
			name: "sampling-null-client-17",
			description: "null client sampling leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});
		expect((service as any).client).toBeNull();

		service.setSamplingHandler(async () => "x");
		expect((service as any).mcpSamplingHandler).toBeTruthy();
		expect(setRequestHandler).not.toHaveBeenCalled();
	});

	it("removeSamplingHandler with null client clears handler without removeRequestHandler", () => {
		const service = new McpClientService({
			name: "sampling-null-remove-17",
			description: "null client remove sampling leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
			samplingHandler: async () => "pre",
		});
		expect((service as any).mcpSamplingHandler).toBeTruthy();
		expect((service as any).client).toBeNull();

		expect(() => service.removeSamplingHandler()).not.toThrow();
		expect((service as any).mcpSamplingHandler).toBeNull();
		expect(removeRequestHandler).not.toHaveBeenCalled();
	});
});
