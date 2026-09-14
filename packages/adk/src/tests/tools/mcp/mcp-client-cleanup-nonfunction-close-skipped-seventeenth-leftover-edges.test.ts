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
 * Seventeenth leftover (session lifecycle): `typeof this.client.close ===
 * "function"` gate — truthy non-function `close` skips the await and still
 * proceeds to transport cleanup (asymmetry vs missing close already covered).
 */
describe("mcp-client cleanup nonfunction close skipped seventeenth leftover", () => {
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
		transportClose.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ label: "string close", close: "not-a-fn" },
		{ label: "object close", close: { async: true } },
		{ label: "number close", close: 1 },
		{ label: "boolean close", close: true },
	] as const)("$label is skipped by typeof===function; transport still closes", async ({
		close: closeValue,
	}) => {
		const service = new McpClientService({
			name: "cleanup-nonfn-close-17",
			description: "non-function client.close leftover",
			transport: {
				mode: "stdio" as const,
				command: "npx",
				args: ["-y", "@example/mcp"],
			},
		});
		await service.initialize();
		(service as any).client = { close: closeValue };

		await expect(service.close()).resolves.toBeUndefined();
		expect(transportClose).toHaveBeenCalledTimes(1);
		expect((service as any).client).toBeNull();
		expect((service as any).transport).toBeNull();
		expect(service.isConnected()).toBe(false);
	});
});
