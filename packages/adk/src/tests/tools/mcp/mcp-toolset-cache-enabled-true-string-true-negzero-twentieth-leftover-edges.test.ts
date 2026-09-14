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
	name: "cache-20",
	description: "cache enabled true/negzero twentieth leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-cache-20"],
	},
};

function fakeBaseTool(name: string) {
	return { name, description: `${name} tool` } as any;
}

function defaultToolsPayload() {
	return {
		tools: [
			{
				name: "alpha",
				description: "alpha tool",
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
 * Twentieth leftover: cache leftover pins enabled true/false/1/"yes"/0.
 * Explicitly pin `"true"` early-return+store and SameValueZero `-0`
 * (falsy early-return, but `-0 !== false` so store path still caches).
 */
describe("mcp toolset cache enabled true/string-true/negzero twentieth leftover", () => {
	it('enabled "true" early-returns cached tools and stores on fill', async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: "true" as any },
		});
		(toolset as any).tools = [fakeBaseTool("stale")];
		const cached = await toolset.getTools();
		expect(cached.map((t) => t.name)).toEqual(["stale"]);
		expect(listTools).not.toHaveBeenCalled();

		(toolset as any).tools = [];
		const filled = await toolset.getTools();
		expect(filled.map((t) => t.name)).toEqual(["alpha"]);
		expect((toolset as any).tools).toBe(filled);

		listTools.mockClear();
		const again = await toolset.getTools();
		expect(again).toBe(filled);
		expect(listTools).not.toHaveBeenCalled();
	});

	it("enabled SameValueZero -0: no early-return, but stores (!== false)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: -0 as any },
		});
		(toolset as any).tools = [fakeBaseTool("stale")];
		const first = await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
		expect(first.map((t) => t.name)).toEqual(["alpha"]);
		expect((toolset as any).tools).toBe(first);

		// After store, early-return still false because !(-0) === false is false
		listTools.mockClear();
		const second = await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
		expect(second.map((t) => t.name)).toEqual(["alpha"]);
	});

	it("enabled boolean true still early-returns (control)", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true },
		});
		(toolset as any).tools = [fakeBaseTool("stale")];
		expect((await toolset.getTools()).map((t) => t.name)).toEqual(["stale"]);
		expect(listTools).not.toHaveBeenCalled();
	});
});
