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
	name: "filter-fourteenth",
	description: "array includes undefined name leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-filter"],
	},
};

function fakeBaseTool(name: string) {
	return { name, description: `${name} tool` } as any;
}

/**
 * Fourteenth leftover: array toolFilter uses `includes(tool.name)`.
 * undefined names only match when the filter literally lists undefined.
 */
describe("mcp toolset filter includes undefined-name fourteenth leftover", () => {
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
		convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) =>
			fakeBaseTool(mcpTool.name ?? "anon"),
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

	it("filter [undefined] selects tools whose name is undefined", async () => {
		listTools.mockResolvedValue({
			tools: [
				{ name: undefined, inputSchema: { type: "object", properties: {} } },
				{ name: "keep", inputSchema: { type: "object", properties: {} } },
			],
		});
		const toolset = new McpToolset(baseConfig, [undefined as any]);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["anon"]);
	});

	it('filter ["keep"] still excludes undefined-name tools (control)', async () => {
		listTools.mockResolvedValue({
			tools: [
				{ name: undefined, inputSchema: { type: "object", properties: {} } },
				{ name: "keep", inputSchema: { type: "object", properties: {} } },
			],
		});
		const toolset = new McpToolset(baseConfig, ["keep"]);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["keep"]);
	});
});
