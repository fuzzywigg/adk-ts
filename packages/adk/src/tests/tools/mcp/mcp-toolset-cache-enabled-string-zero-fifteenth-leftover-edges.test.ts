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
	name: "cache-fifteenth",
	description: "cache enabled string-zero leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-cache"],
	},
};

function fakeBaseTool(name: string) {
	return { name, description: `${name} tool` } as any;
}

/**
 * Fifteenth leftover: `!cacheConfig?.enabled === false` — string "0" is truthy
 * so early-returns cached tools. Numeric 0 / "" already in cache operator table.
 */
describe("mcp toolset cache enabled string-zero fifteenth leftover", () => {
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
				{ name: "alpha", inputSchema: { type: "object", properties: {} } },
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

	it('enabled: "0" is truthy so second getTools early-returns', async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: "0" as any },
		});
		await toolset.getTools();
		listTools.mockClear();
		const tools = await toolset.getTools();
		expect(listTools).not.toHaveBeenCalled();
		expect(tools.map((t) => t.name)).toEqual(["alpha"]);
	});

	it("enabled: 0 still refreshes (control falsy)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: 0 as any },
		});
		await toolset.getTools();
		listTools.mockClear();
		await toolset.getTools();
		expect(listTools).toHaveBeenCalled();
	});
});
