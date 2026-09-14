import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initialize = vi.fn();
const close = vi.fn();
const setSamplingHandler = vi.fn();
const removeSamplingHandler = vi.fn();
const listTools = vi.fn();
const convertMcpToolToBaseTool = vi.fn();
const McpClientServiceMock = vi.fn();

vi.mock("../../../tools/mcp/client", () => ({
	McpClientService: McpClientServiceMock,
}));

vi.mock("../../../tools/mcp/create-tool", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../../tools/mcp/create-tool")>();
	return {
		...actual,
		convertMcpToolToBaseTool: (...args: unknown[]) =>
			convertMcpToolToBaseTool(...args),
	};
});

const { McpToolset } = await import("../../../tools/mcp");

const baseConfig = {
	name: "post-close-reinit-17",
	description: "post-close toolset session recreate leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-life"],
	},
};

function fakeBaseTool(name: string) {
	return { name, description: `${name} tool` } as any;
}

/**
 * Seventeenth leftover (session lifecycle): after a successful `close()`,
 * `initialize` / `getTools` recreate `clientService` and reopen the session.
 */
describe("mcp-toolset post-close reinit session seventeenth leftover", () => {
	beforeEach(() => {
		initialize.mockReset();
		close.mockReset();
		setSamplingHandler.mockReset();
		removeSamplingHandler.mockReset();
		listTools.mockReset();
		convertMcpToolToBaseTool.mockReset();
		McpClientServiceMock.mockReset();

		initialize.mockResolvedValue(undefined);
		close.mockResolvedValue(undefined);
		listTools.mockResolvedValue({
			tools: [
				{
					name: "alpha",
					description: "a",
					inputSchema: { type: "object", properties: {} },
				},
			],
		});
		convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) =>
			fakeBaseTool(mcpTool.name),
		);
		McpClientServiceMock.mockImplementation(function McpClientService() {
			return {
				initialize: async () => {
					await initialize();
					return { listTools };
				},
				close,
				setSamplingHandler,
				removeSamplingHandler,
			};
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("initialize after close constructs a new clientService and connects", async () => {
		const toolset = new McpToolset(baseConfig);
		expect(McpClientServiceMock).toHaveBeenCalledTimes(1);
		await toolset.close();
		expect((toolset as any).clientService).toBeNull();

		McpClientServiceMock.mockClear();
		initialize.mockClear();

		await toolset.initialize();
		expect(McpClientServiceMock).toHaveBeenCalledTimes(1);
		expect(initialize).toHaveBeenCalledTimes(1);
		expect((toolset as any).clientService).not.toBeNull();
	});

	it("getTools after close recreates client and lists tools", async () => {
		const toolset = new McpToolset(baseConfig);
		await toolset.close();
		expect((toolset as any).clientService).toBeNull();

		McpClientServiceMock.mockClear();
		listTools.mockClear();

		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["alpha"]);
		expect(McpClientServiceMock).toHaveBeenCalled();
		expect(listTools).toHaveBeenCalled();
	});
});
