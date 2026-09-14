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
	description: "cache enabled string truthy twentieth leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-cache"],
	},
};

function fakeBaseTool(name: string) {
	return {
		name,
		description: `${name} tool`,
	} as any;
}

function defaultToolsPayload() {
	return {
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
	};
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
	listTools.mockResolvedValue(defaultToolsPayload());
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
 * Twentieth leftover: early-return uses `!enabled === false` —
 * string "false"/"0"/"true" are all truthy → early-return on;
 * numeric 0 still no early-return (cache leftover already pinned).
 */
describe("mcp toolset cache enabled string-false/zero/true twentieth leftover", () => {
	it.each([
		"false",
		"0",
		"true",
	] as const)("enabled: %j early-returns when cache warm", async (enabled) => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: enabled as any },
		});
		(toolset as any).tools = [fakeBaseTool("stale")];

		const result = await toolset.getTools();
		expect(result.map((t) => t.name)).toEqual(["stale"]);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("numeric 0 still no early-return (cache leftover control)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: 0 as any },
		});
		(toolset as any).tools = [fakeBaseTool("stale")];

		const result = await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
		expect(result.map((t) => t.name).sort()).toEqual(["alpha", "beta"]);
	});

	it('enabled: "false" still stores via enabled !== false', async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: "false" as any },
		});
		(toolset as any).tools = [];

		await toolset.getTools();
		expect((toolset as any).tools.map((t: any) => t.name).sort()).toEqual([
			"alpha",
			"beta",
		]);

		listTools.mockClear();
		await toolset.getTools();
		expect(listTools).not.toHaveBeenCalled();
	});
});
