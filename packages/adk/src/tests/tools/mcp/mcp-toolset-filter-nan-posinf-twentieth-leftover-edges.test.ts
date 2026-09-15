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
	name: "filter-twentieth-heavy",
	description: "toolFilter residual heavy after providers #269",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-filter-20h"],
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
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * `if (!toolFilter)` — complements closed #271 true/`"true"`/`-Infinity` /
 * `-0` all-selected with `POSITIVE_INFINITY` / `1` / `Object(true)` truthy
 * non-fn non-array → all selected; `NaN` falsy → no filter → all selected.
 */
describe("mcp toolset filter nan/posinf twentieth leftover heavy", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "Object(true)", value: Object(true) },
	])("toolFilter $label selects every tool (non-fn non-array)", async ({
		value,
	}) => {
		const toolset = new McpToolset(baseConfig, value as any);
		expect((await toolset.getTools()).map((t) => t.name)).toEqual(["alpha"]);
	});

	it("toolFilter NaN is falsy → no filter → every tool selected", async () => {
		const toolset = new McpToolset(baseConfig, Number.NaN as any);
		expect((await toolset.getTools()).map((t) => t.name)).toEqual(["alpha"]);
	});
});
