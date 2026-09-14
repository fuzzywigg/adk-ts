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
	name: "tools-true-twentieth",
	description: "tools boolean true + cache string false twentieth leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-true-20"],
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
 * Twentieth leftover: `!tools || !Array.isArray(tools)` — boolean `true`
 * passes `!tools` then fails Array.isArray (thirteenth pinned object/null).
 * cacheConfig.enabled `"false"` is truthy so `!"false" === false` early-returns
 * (boolean false disables — leftover cache operator asymmetry).
 */
describe("mcp toolset tools boolean-true + cache string-false twentieth leftover", () => {
	it("tools: true warns and returns [] via !Array.isArray", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue({ tools: true });
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('cache enabled: "false" early-returns (truthy string; unlike boolean false)', async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: "false" as any },
		});
		(toolset as any).tools = [fakeBaseTool("stale")];
		const result = await toolset.getTools();
		expect(result.map((t) => t.name)).toEqual(["stale"]);
		expect(listTools).not.toHaveBeenCalled();
	});

	it('cache enabled: "true" early-returns and stores (control)', async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: "true" as any },
		});
		const first = await toolset.getTools();
		expect(first.map((t) => t.name)).toEqual(["alpha"]);
		listTools.mockClear();
		expect(await toolset.getTools()).toBe(first);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("cache enabled: boolean false still disables store (control)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: false },
		});
		const tools = await toolset.getTools();
		expect(tools).toHaveLength(1);
		expect((toolset as any).tools).toEqual([]);
		await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(2);
	});
});
