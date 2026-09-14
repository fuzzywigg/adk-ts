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
	name: "filter-null-fifteenth",
	description: "array includes null name leftover",
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
 * Fifteenth leftover: includes(tool.name) — filter [null] matches name: null.
 * Fourteenth covered undefined; empty-string name needs filter [""].
 */
describe("mcp toolset filter includes null/empty name fifteenth leftover", () => {
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

	it("filter [null] selects tools whose name is null", async () => {
		listTools.mockResolvedValue({
			tools: [
				{ name: null, inputSchema: { type: "object", properties: {} } },
				{ name: "keep", inputSchema: { type: "object", properties: {} } },
			],
		});
		const toolset = new McpToolset(baseConfig, [null as any]);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["anon"]);
	});

	it('filter [""] selects tools whose name is empty string (kept, not ?? anon)', async () => {
		listTools.mockResolvedValue({
			tools: [
				{ name: "", inputSchema: { type: "object", properties: {} } },
				{ name: "keep", inputSchema: { type: "object", properties: {} } },
			],
		});
		const toolset = new McpToolset(baseConfig, [""]);
		const tools = await toolset.getTools();
		// "" is not nullish so convert mock keeps empty name (unlike null/undefined)
		expect(tools.map((t) => t.name)).toEqual([""]);
	});

	it('filter ["keep"] still excludes null/empty names (control)', async () => {
		listTools.mockResolvedValue({
			tools: [
				{ name: null, inputSchema: { type: "object", properties: {} } },
				{ name: "", inputSchema: { type: "object", properties: {} } },
				{ name: "keep", inputSchema: { type: "object", properties: {} } },
			],
		});
		const toolset = new McpToolset(baseConfig, ["keep"]);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["keep"]);
	});
});
