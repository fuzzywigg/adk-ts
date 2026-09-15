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
	name: "filter-twenty-first",
	description: "true vs empty-array filter leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-filter-21"],
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
 * Twenty-first leftover (HEAVY tip-relaunch residual after thirteenth object
 * filter / empty `[]`): `toolFilter: true|"true"|NEGATIVE_INFINITY` → not
 * function/array → fallthrough `true` (select all); `-0` → `!toolFilter`
 * early `true`. Contrast with `[]` selecting nothing.
 */
describe("mcp toolset filter true/negzero vs emptyarray twenty-first leftover", () => {
	it.each([
		{ label: "boolean true", filter: true },
		{ label: '"true"', filter: "true" },
		{ label: "NEGATIVE_INFINITY", filter: Number.NEGATIVE_INFINITY },
	])("toolFilter $label falls through to select-all", async ({ filter }) => {
		const toolset = new McpToolset(baseConfig, filter as any);
		expect((await toolset.getTools()).map((t) => t.name)).toEqual(["alpha"]);
	});

	it("toolFilter -0 is falsy → !toolFilter early select-all", async () => {
		const toolset = new McpToolset(baseConfig, -0 as any);
		expect((await toolset.getTools()).map((t) => t.name)).toEqual(["alpha"]);
	});

	it("empty-array filter still selects nothing (control contrast)", async () => {
		const toolset = new McpToolset(baseConfig, []);
		expect((await toolset.getTools()).map((t) => t.name)).toEqual([]);
	});
});
