import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

const initialize = vi.fn();
const close = vi.fn();
const setSamplingHandler = vi.fn();
const removeSamplingHandler = vi.fn();
const listTools = vi.fn();
const callTool = vi.fn();
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

function fakeBaseTool(name: string) {
	return {
		name,
		description: `${name} tool`,
	} as any;
}

beforeEach(() => {
	initialize.mockReset();
	close.mockReset();
	setSamplingHandler.mockReset();
	removeSamplingHandler.mockReset();
	listTools.mockReset();
	callTool.mockReset();
	convertMcpToolToBaseTool.mockReset();
	McpClientServiceMock.mockReset();

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
	convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) =>
		fakeBaseTool(mcpTool.name),
	);

	McpClientServiceMock.mockImplementation(function McpClientService() {
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

	it("isSelected falls through to true for non-array non-function filters", () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).toolFilter = "not-a-real-filter";
		expect((toolset as any).isSelected({ name: "anything" })).toBe(true);

		(toolset as any).toolFilter = 42;
		expect((toolset as any).isSelected({ name: "still-ok" })).toBe(true);
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

	it("getTools rethrows existing McpError instances unchanged", async () => {
		const original = new McpError(
			"typed list failure",
			McpErrorType.CONNECTION_ERROR,
		);
		listTools.mockRejectedValue(original);
		const toolset = new McpToolset(baseConfig);
		await expect(toolset.getTools()).rejects.toBe(original);
	});

	it("getTools continues when individual tool conversion fails", async () => {
		listTools.mockResolvedValue({
			tools: [
				{
					name: "bad",
					description: "fails conversion",
					inputSchema: { type: "object", properties: {} },
				},
				{
					name: "good",
					description: "succeeds",
					inputSchema: { type: "object", properties: {} },
				},
			],
		});
		convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) => {
			if (mcpTool.name === "bad") {
				throw new Error("schema boom");
			}
			return fakeBaseTool(mcpTool.name);
		});
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const toolset = new McpToolset(baseConfig);
		const tools = await toolset.getTools();

		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("good");
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Failed to create tool from MCP tool "bad"'),
			expect.any(Error),
		);
		errorSpy.mockRestore();
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

	it("does not early-return cached tools when cacheConfig.enabled is undefined", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).tools = [fakeBaseTool("stale")];

		await toolset.getTools();
		expect(listTools).toHaveBeenCalledTimes(1);
		expect((toolset as any).tools.map((t: any) => t.name)).toEqual([
			"keep",
			"drop",
		]);
	});

	it("close and dispose are idempotent", async () => {
		const toolset = new McpToolset(baseConfig);
		await toolset.close();
		await toolset.close();
		await toolset.dispose();
		expect(close).toHaveBeenCalled();
	});

	it("close logs success when debug is enabled", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		await toolset.close();
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("MCP toolset closed successfully"),
		);
		log.mockRestore();
	});

	it("close logs errors from client close and clears isClosing", async () => {
		close.mockRejectedValue(new Error("close boom"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);

		await expect(toolset.close()).resolves.toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error closing MCP toolset:",
			expect.any(Error),
		);
		expect((toolset as any).isClosing).toBe(false);
		errorSpy.mockRestore();
	});

	it("close returns early while already closing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;
		await toolset.close();
		expect(close).not.toHaveBeenCalled();
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

	it("setSamplingHandler recreates clientService when nulled", () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).clientService = null;
		McpClientServiceMock.mockClear();

		toolset.setSamplingHandler(vi.fn() as any);

		expect(McpClientServiceMock).toHaveBeenCalledTimes(1);
		expect(setSamplingHandler).toHaveBeenCalled();
	});

	it("removeSamplingHandler is a no-op when clientService is null", () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).clientService = null;
		expect(() => toolset.removeSamplingHandler()).not.toThrow();
		expect(removeSamplingHandler).not.toHaveBeenCalled();
	});

	it("getMcpTools fetches then closes the temporary toolset", async () => {
		const tools = await getMcpTools(baseConfig, ["keep"]);
		expect(tools).toHaveLength(1);
		expect(tools[0].name).toBe("keep");
		expect(close).toHaveBeenCalled();
	});

	it("getMcpTools still returns tools when close rejects", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const closeSpy = vi
			.spyOn(McpToolset.prototype, "close")
			.mockRejectedValue(new Error("late close failure"));

		try {
			const tools = await getMcpTools(baseConfig, ["keep"]);
			expect(tools).toHaveLength(1);
			expect(errorSpy).toHaveBeenCalledWith(
				"Error closing toolset:",
				expect.any(Error),
			);
		} finally {
			closeSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});

	it("getMcpTools accepts predicate filters", async () => {
		const tools = await getMcpTools(
			baseConfig,
			(tool: { name: string }) => tool.name === "drop",
		);
		expect(tools.map((t) => t.name)).toEqual(["drop"]);
	});

	it("recreates clientService when cleared before initialize", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).clientService = null;
		McpClientServiceMock.mockClear();
		await toolset.initialize();
		expect(McpClientServiceMock).toHaveBeenCalledTimes(1);
		expect(initialize).toHaveBeenCalled();
	});

	it("getTools recreates clientService when nulled before listing", async () => {
		const toolset = new McpToolset(baseConfig, ["keep"]);
		(toolset as any).clientService = null;
		McpClientServiceMock.mockClear();

		const tools = await toolset.getTools();
		expect(tools).toHaveLength(1);
		expect(McpClientServiceMock).toHaveBeenCalled();
		expect(listTools).toHaveBeenCalled();
	});

	it("passes ToolContext into predicate filters during getTools", async () => {
		const seen: unknown[] = [];
		const toolset = new McpToolset(baseConfig, (tool, context) => {
			seen.push({ name: tool.name, context });
			return tool.name === "keep";
		});
		const context = { invocationId: "inv-1" } as any;
		const tools = await toolset.getTools(context);
		expect(tools.map((t) => t.name)).toEqual(["keep"]);
		expect(seen).toEqual(
			expect.arrayContaining([
				{ name: "keep", context },
				{ name: "drop", context },
			]),
		);
	});

	it("getTools wraps non-Error list failures via String()", async () => {
		listTools.mockRejectedValue("list-string-fail");
		const toolset = new McpToolset(baseConfig);
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("list-string-fail"),
		});
	});

	it("initialize is idempotent after a successful first connect", async () => {
		const toolset = new McpToolset(baseConfig);
		await toolset.initialize();
		await toolset.initialize();
		expect(initialize).toHaveBeenCalledTimes(2);
	});

	it("refreshTools returns filtered tools after clearing cache", async () => {
		const toolset = new McpToolset(
			{ ...baseConfig, cacheConfig: { enabled: true } },
			["keep"],
		);
		const first = await toolset.getTools();
		expect(first).toHaveLength(1);
		expect(listTools).toHaveBeenCalledTimes(1);

		const refreshed = await toolset.refreshTools();
		expect(refreshed.map((t) => t.name)).toEqual(["keep"]);
		expect(listTools).toHaveBeenCalledTimes(2);
	});

	it("convertADKToolsToMCP handles tools with empty description", () => {
		const toolset = new McpToolset(baseConfig);
		const converted = toolset.convertADKToolsToMCP([
			{
				name: "blank",
				description: "",
				getDeclaration() {
					return { name: "blank", description: "" };
				},
			} as any,
		]);
		expect(converted[0]).toEqual(
			expect.objectContaining({
				name: "blank",
				description: "",
			}),
		);
	});

	it("getMcpTools without filter returns all listed tools", async () => {
		const tools = await getMcpTools(baseConfig);
		expect(tools.map((t) => t.name).sort()).toEqual(["drop", "keep"]);
		expect(close).toHaveBeenCalled();
	});
});

describe("McpToolset leftover cache/filter/sampling edges", () => {
	it("getTools warns and returns [] when tools is a non-array object", async () => {
		listTools.mockResolvedValue({ tools: { name: "x" } });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);
		await expect(toolset.getTools()).resolves.toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("no tools or invalid tools array"),
		);
		warn.mockRestore();
	});

	it("logs exact sampling handler set/removed strings when debug is true", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		toolset.setSamplingHandler(vi.fn() as any);
		expect(log).toHaveBeenCalledWith("🎯 Sampling handler set for MCP toolset");
		toolset.removeSamplingHandler();
		expect(log).toHaveBeenCalledWith(
			"🚫 Sampling handler removed from MCP toolset",
		);
		log.mockRestore();
	});

	it("cache early-return ignores unused maxAge/maxSize fields", async () => {
		const toolset = new McpToolset({
			...baseConfig,
			cacheConfig: { enabled: true, maxAge: 1, maxSize: 1 },
		});
		const first = await toolset.getTools();
		expect(first).toHaveLength(2);
		expect(listTools).toHaveBeenCalledTimes(1);
		const second = await toolset.getTools();
		expect(second).toBe(first);
		expect(listTools).toHaveBeenCalledTimes(1);
	});

	it("getTools returns [] for an empty tools array without the invalid-shape warn", async () => {
		listTools.mockResolvedValue({ tools: [] });
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);
		await expect(toolset.getTools()).resolves.toEqual([]);
		expect(warn).not.toHaveBeenCalledWith(
			expect.stringContaining("no tools or invalid tools array"),
		);
		warn.mockRestore();
	});

	it("does not log sampling handler messages when debug is false", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);
		toolset.setSamplingHandler(vi.fn() as any);
		toolset.removeSamplingHandler();
		expect(log).not.toHaveBeenCalledWith(
			"🎯 Sampling handler set for MCP toolset",
		);
		expect(log).not.toHaveBeenCalledWith(
			"🚫 Sampling handler removed from MCP toolset",
		);
		log.mockRestore();
	});
});
