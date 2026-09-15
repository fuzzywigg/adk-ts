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
	name: "cache-residual-deepen",
	description: "toolset cache posinf/nan/object-true twentieth residual deepen",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-cache-residual"],
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
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 true/negzero cache):
 * `enabled !== false` store + `!enabled === false` early-return —
 * POSITIVE_INFINITY / `Object(true)` early-return+store; `NaN` no early-return
 * but still stores (`NaN !== false`). Skip `{}`/`1` (cache-operator leftovers).
 */
describe("mcp toolset cache posinf/nan/object-true twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", enabled: Number.POSITIVE_INFINITY as any },
		{ label: "Object(true)", enabled: Object(true) as any },
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

	it("enabled NaN: no early-return but store path keeps tools (!== false)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: Number.NaN as any },
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
