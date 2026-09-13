import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpErrorType } from "../../../tools/mcp/types";

const initialize = vi.fn();
const close = vi.fn();
const setSamplingHandler = vi.fn();
const removeSamplingHandler = vi.fn();
const listTools = vi.fn();
const callTool = vi.fn();

vi.mock("../../../tools/mcp/client", () => ({
	McpClientService: vi.fn(function McpClientService() {
		return {
			initialize: async () => {
				await initialize();
				return {
					listTools,
					callTool,
				};
			},
			close,
			setSamplingHandler,
			removeSamplingHandler,
		};
	}),
}));

const { McpToolset, getMcpTools } = await import("../../../tools/mcp");

const baseConfig = {
	name: "unit",
	description: "unit test toolset with enough description length",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp"],
	},
};

beforeEach(() => {
	initialize.mockReset();
	close.mockReset();
	setSamplingHandler.mockReset();
	removeSamplingHandler.mockReset();
	listTools.mockReset();
	callTool.mockReset();
	initialize.mockResolvedValue(undefined);
	close.mockResolvedValue(undefined);
	listTools.mockResolvedValue({
		tools: [
			{
				name: "keep",
				description: "kept tool",
				inputSchema: { type: "object", properties: {} },
			},
			{
				name: "drop",
				description: "filtered out",
				inputSchema: { type: "object", properties: {} },
			},
		],
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("McpToolset offline helpers", () => {
	it("isSelected includes all tools when no filter is set", () => {
		const toolset = new McpToolset(baseConfig);
		expect((toolset as any).isSelected({ name: "a" })).toBe(true);
		expect((toolset as any).isSelected({ name: "b" })).toBe(true);
	});

	it("isSelected honors array and predicate filters", () => {
		const byName = new McpToolset(baseConfig, ["keep"]);
		expect((byName as any).isSelected({ name: "keep" })).toBe(true);
		expect((byName as any).isSelected({ name: "drop" })).toBe(false);

		const byFn = new McpToolset(baseConfig, (tool: { name: string }) =>
			tool.name.startsWith("ok_"),
		);
		expect((byFn as any).isSelected({ name: "ok_one" })).toBe(true);
		expect((byFn as any).isSelected({ name: "nope" })).toBe(false);
	});

	it("convertADKToolsToMCP maps tool declarations", () => {
		const toolset = new McpToolset(baseConfig);
		const tools = [
			{
				name: "echo",
				description: "echoes input for testing conversion paths",
				getDeclaration() {
					return {
						name: "echo",
						description: "echoes input for testing conversion paths",
						parameters: {
							type: "OBJECT",
							properties: {
								text: { type: "STRING" },
							},
						},
					};
				},
			},
		] as any;

		const converted = toolset.convertADKToolsToMCP(tools);
		expect(converted[0]).toEqual(
			expect.objectContaining({
				name: "echo",
				description: "echoes input for testing conversion paths",
			}),
		);
	});

	it("getTools rejects when closing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
	});

	it("initialize rejects when closing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;
		await expect(toolset.initialize()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
	});

	it("getTools lists, filters, caches, and returns cached tools", async () => {
		const toolset = new McpToolset(
			{ ...baseConfig, cacheConfig: { enabled: true } },
			["keep"],
		);
		const first = await toolset.getTools();
		expect(first).toHaveLength(1);
		expect(first[0].name).toBe("keep");
		expect(listTools).toHaveBeenCalledTimes(1);

		const second = await toolset.getTools();
		expect(second).toBe(first);
		expect(listTools).toHaveBeenCalledTimes(1);
	});

	it("getTools returns empty when MCP lists no tools", async () => {
		listTools.mockResolvedValue({ tools: null });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);
		await expect(toolset.getTools()).resolves.toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("getTools wraps non-Mcp errors as CONNECTION_ERROR", async () => {
		listTools.mockRejectedValue(new Error("list failed"));
		const toolset = new McpToolset(baseConfig);
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("Error retrieving MCP tools"),
		});
	});

	it("does not cache tools when cacheConfig.enabled is false", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: false },
		});
		await toolset.getTools();
		expect((toolset as any).tools).toEqual([]);
		await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(2);
	});

	it("close and dispose are idempotent", async () => {
		const toolset = new McpToolset(baseConfig);
		await toolset.close();
		await toolset.close();
		await toolset.dispose();
		expect(close).toHaveBeenCalled();
	});

	it("refreshTools clears cached tools before refetch", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).tools = [{ name: "cached" }];
		const getTools = vi
			.spyOn(toolset, "getTools")
			.mockResolvedValue([{ name: "fresh" } as any]);

		const result = await toolset.refreshTools();
		expect((toolset as any).tools).toEqual([]);
		expect(getTools).toHaveBeenCalled();
		expect(result).toEqual([{ name: "fresh" }]);
	});

	it("setSamplingHandler and removeSamplingHandler delegate to client", () => {
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const handler = vi.fn();

		toolset.setSamplingHandler(handler as any);
		expect(setSamplingHandler).toHaveBeenCalledWith(handler);

		toolset.removeSamplingHandler();
		expect(removeSamplingHandler).toHaveBeenCalled();
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("getMcpTools fetches then closes the temporary toolset", async () => {
		const tools = await getMcpTools(baseConfig, ["keep"]);
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("keep");
		expect(close).toHaveBeenCalled();
	});

	it("recreates clientService when cleared before initialize", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).clientService = null;
		await toolset.initialize();
		expect(initialize).toHaveBeenCalled();
	});
});
