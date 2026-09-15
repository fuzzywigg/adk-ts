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
	name: "cache-twentieth",
	description: "toolset cache enabled true/negzero twentieth residual",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-cache"],
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
			{
				name: "beta",
				description: "beta tool",
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
 * Twentieth leftover (HEAVY tip-relaunch residual after cache operator leftovers):
 * `enabled !== false` store + `!enabled === false` early-return — boolean
 * `true` / `"true"` / `[]` / `NEGATIVE_INFINITY` early-return and store;
 * SameValueZero `-0` is falsy for early-return but still stores (`-0 !== false`).
 */
describe("mcp toolset cache enabled true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", enabled: true as any },
		{ label: '"true"', enabled: "true" as any },
		{ label: "empty array", enabled: [] as any },
		{ label: "NEGATIVE_INFINITY", enabled: Number.NEGATIVE_INFINITY as any },
	])("enabled $label early-returns and stores", async ({ enabled }) => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled },
		});
		(toolset as any).tools = [fakeBaseTool("preseed")];

		const first = await toolset.getTools();
		expect(first.map((t) => t.name)).toEqual(["preseed"]);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("enabled -0: no early-return but store path keeps tools (!== false)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: -0 as any },
		});
		(toolset as any).tools = [];

		const first = await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
		expect(first.map((t) => t.name).sort()).toEqual(["alpha", "beta"]);
		expect((toolset as any).tools.map((t: any) => t.name).sort()).toEqual([
			"alpha",
			"beta",
		]);

		listTools.mockClear();
		await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
	});
});
