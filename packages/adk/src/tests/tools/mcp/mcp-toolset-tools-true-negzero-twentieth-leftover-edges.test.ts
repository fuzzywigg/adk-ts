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
	name: "tools-20",
	description: "toolsResponse.tools true/negzero twentieth leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-tools-20"],
	},
};

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
	convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) => ({
		name: mcpTool.name,
		description: `${mcpTool.name} tool`,
	}));

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
 * Twentieth leftover: thirteenth pins `tools: []` as valid empty array.
 * Boolean `true` / `"true"` pass `!tools` but fail `Array.isArray` → warn+[];
 * SameValueZero `-0` fails `!tools` → warn+[].
 */
describe("mcp toolset toolsResponse.tools true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", tools: true },
		{ label: '"true"', tools: "true" },
		{ label: "SameValueZero -0", tools: -0 },
	])("tools=$label → warn + [] via !tools || !Array.isArray", async ({
		tools,
	}) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue({ tools });
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"MCP server returned no tools or invalid tools array",
		);
		expect(convertMcpToolToBaseTool).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("tools: [] still valid empty list without invalid warn (control)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue({ tools: [] });
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).not.toHaveBeenCalledWith(
			"MCP server returned no tools or invalid tools array",
		);
		warn.mockRestore();
	});
});
