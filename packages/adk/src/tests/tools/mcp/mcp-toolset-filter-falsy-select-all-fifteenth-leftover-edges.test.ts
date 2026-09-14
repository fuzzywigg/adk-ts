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
	name: "filter-fifteenth",
	description: "falsy toolFilter select-all leftover",
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
 * Fifteenth leftover: `if (!toolFilter) return true` — false/0/"" select all.
 * Empty array [] is truthy and excludes all (prior leftovers).
 */
describe("mcp toolset filter falsy select-all fifteenth leftover", () => {
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
				{ name: "beta", inputSchema: { type: "object", properties: {} } },
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

	it.each([
		false,
		0,
		"",
	] as const)("toolFilter %j is falsy so selects all tools", async (toolFilter) => {
		const toolset = new McpToolset(baseConfig, toolFilter as any);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["alpha", "beta"]);
	});

	it("empty array still excludes all (control truthy filter)", async () => {
		const toolset = new McpToolset(baseConfig, []);
		const tools = await toolset.getTools();
		expect(tools).toEqual([]);
	});
});
