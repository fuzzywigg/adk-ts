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
	name: "filter-thirteenth",
	description: "non-array filter + empty tools leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-filter-13"],
	},
};

function fakeBaseTool(name: string) {
	return { name, description: `${name} tool` } as any;
}

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
				description: "alpha tool",
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

/**
 * Thirteenth leftover: isSelected returns true for non-function non-array
 * filters; `!tools || !Array.isArray(tools)` treats [] as valid empty list.
 */
describe("mcp toolset filter object + empty tools thirteenth leftover", () => {
	it("object toolFilter is not a function/array so every tool is selected", async () => {
		const toolset = new McpToolset(baseConfig, { include: ["nope"] } as any);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["alpha"]);
	});

	it("empty-array filter selects nothing (includes never matches)", async () => {
		const toolset = new McpToolset(baseConfig, []);
		expect((await toolset.getTools()).map((t) => t.name)).toEqual([]);
	});

	it("tools: [] is a valid array so getTools returns [] (not warn-invalid)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue({ tools: [] });
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "missing tools", payload: {} },
		{ label: "null tools", payload: { tools: null } },
		{ label: "object tools", payload: { tools: { name: "x" } } },
	])("$label warns and returns []", async ({ payload }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue(payload);
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});
});
