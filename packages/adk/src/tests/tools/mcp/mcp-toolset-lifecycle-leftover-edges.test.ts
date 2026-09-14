import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpError, McpErrorType } from "../../../tools/mcp/types";

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

const { McpToolset, getMcpTools } = await import("../../../tools/mcp");

const baseConfig = {
	name: "lifecycle-unit",
	description: "lifecycle leftover edges for MCP toolset",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-life"],
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
				name: "keep",
				description: "kept",
				inputSchema: { type: "object", properties: {} },
			},
			{
				name: "drop",
				description: "dropped",
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

describe("McpToolset debug + sampling lifecycle leftover edges (post #141)", () => {
	it.each([
		{ debug: true, expectLog: true },
		{ debug: false, expectLog: false },
		{ debug: undefined, expectLog: false },
	])("setSamplingHandler debug=$debug logs=$expectLog", ({
		debug,
		expectLog,
	}) => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug });
		toolset.setSamplingHandler(vi.fn() as any);
		expect(setSamplingHandler).toHaveBeenCalled();
		if (expectLog) {
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining("Sampling handler set"),
			);
		} else {
			expect(log).not.toHaveBeenCalledWith(
				expect.stringContaining("Sampling handler set"),
			);
		}
		log.mockRestore();
	});

	it.each([
		{ debug: true, expectLog: true },
		{ debug: false, expectLog: false },
	])("removeSamplingHandler debug=$debug logs=$expectLog when client exists", ({
		debug,
		expectLog,
	}) => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug });
		toolset.removeSamplingHandler();
		expect(removeSamplingHandler).toHaveBeenCalled();
		if (expectLog) {
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining("Sampling handler removed"),
			);
		} else {
			expect(log).not.toHaveBeenCalledWith(
				expect.stringContaining("Sampling handler removed"),
			);
		}
		log.mockRestore();
	});

	it("removeSamplingHandler with null clientService skips debug log even when debug true", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		(toolset as any).clientService = null;
		toolset.removeSamplingHandler();
		expect(removeSamplingHandler).not.toHaveBeenCalled();
		expect(log).not.toHaveBeenCalledWith(
			expect.stringContaining("Sampling handler removed"),
		);
		log.mockRestore();
	});

	it("setSamplingHandler recreates client when null and still logs when debug", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		(toolset as any).clientService = null;
		McpClientServiceMock.mockClear();
		toolset.setSamplingHandler(vi.fn() as any);
		expect(McpClientServiceMock).toHaveBeenCalledTimes(1);
		expect(setSamplingHandler).toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Sampling handler set"),
		);
		log.mockRestore();
	});

	it.each([
		{ debug: true, expectLog: true },
		{ debug: false, expectLog: false },
	])("close debug=$debug success log=$expectLog", async ({
		debug,
		expectLog,
	}) => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug });
		await toolset.close();
		if (expectLog) {
			expect(log).toHaveBeenCalledWith(
				expect.stringContaining("MCP toolset closed successfully"),
			);
		} else {
			expect(log).not.toHaveBeenCalledWith(
				expect.stringContaining("MCP toolset closed successfully"),
			);
		}
		expect((toolset as any).clientService).toBeNull();
		expect((toolset as any).tools).toEqual([]);
		expect((toolset as any).isClosing).toBe(false);
		log.mockRestore();
	});

	it("close error path clears isClosing in finally and does not leave tools", async () => {
		close.mockRejectedValue(new Error("boom"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		(toolset as any).tools = [fakeBaseTool("x")];
		await toolset.close();
		expect(errorSpy).toHaveBeenCalledWith(
			"Error closing MCP toolset:",
			expect.any(Error),
		);
		expect((toolset as any).isClosing).toBe(false);
		errorSpy.mockRestore();
	});

	it("close while already closing is a no-op (no client.close)", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;
		await toolset.close();
		expect(close).not.toHaveBeenCalled();
	});

	it("dispose delegates to close and clears resources", async () => {
		const toolset = new McpToolset({ ...baseConfig, debug: true });
		(toolset as any).tools = [fakeBaseTool("cached")];
		await toolset.dispose();
		expect(close).toHaveBeenCalled();
		expect((toolset as any).clientService).toBeNull();
		expect((toolset as any).tools).toEqual([]);
	});

	it("initialize and getTools reject while closing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;
		await expect(toolset.initialize()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
	});

	it("close without clientService still clears tools and isClosing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).clientService = null;
		(toolset as any).tools = [fakeBaseTool("orphan")];
		await toolset.close();
		expect(close).not.toHaveBeenCalled();
		expect((toolset as any).tools).toEqual([]);
		expect((toolset as any).isClosing).toBe(false);
	});
});

describe("getMcpTools leftover edges (post #141)", () => {
	it("returns filtered tools then closes", async () => {
		const tools = await getMcpTools(baseConfig, ["keep"]);
		expect(tools.map((t) => t.name)).toEqual(["keep"]);
		expect(close).toHaveBeenCalled();
	});

	it("predicate filter that rejects all still closes", async () => {
		const tools = await getMcpTools(baseConfig, () => false);
		expect(tools).toEqual([]);
		expect(close).toHaveBeenCalled();
	});

	it("propagates McpError from getTools and still attempts close", async () => {
		const original = new McpError("list typed", McpErrorType.CONNECTION_ERROR);
		listTools.mockRejectedValue(original);
		await expect(getMcpTools(baseConfig)).rejects.toBe(original);
		expect(close).toHaveBeenCalled();
	});

	it("wraps non-Mcp getTools failures then closes", async () => {
		listTools.mockRejectedValue(new Error("raw"));
		await expect(getMcpTools(baseConfig)).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("raw"),
		});
		expect(close).toHaveBeenCalled();
	});

	it("returns tools when close rejects and logs the close error", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const closeSpy = vi
			.spyOn(McpToolset.prototype, "close")
			.mockRejectedValue(new Error("late close"));
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

	it.each([
		{ tools: null },
		{ tools: undefined },
		{ tools: "nope" },
		{ tools: 7 },
		{ tools: { nested: true } },
		{},
	])("empty/invalid tools payload %j → [] then close", async (payload) => {
		listTools.mockResolvedValue(payload);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await expect(getMcpTools(baseConfig)).resolves.toEqual([]);
		expect(close).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("without filter returns all converted tools", async () => {
		const tools = await getMcpTools(baseConfig);
		expect(tools.map((t) => t.name).sort()).toEqual(["drop", "keep"]);
	});

	it("convertADKToolsToMCP remains available on temporary toolset path", () => {
		const toolset = new McpToolset(baseConfig);
		const converted = toolset.convertADKToolsToMCP([
			{
				name: "echo",
				description: "echo tool for conversion coverage",
				getDeclaration() {
					return {
						name: "echo",
						description: "echo tool for conversion coverage",
						parameters: { type: "OBJECT", properties: {} },
					};
				},
			} as any,
		]);
		expect(converted[0]).toEqual(
			expect.objectContaining({
				name: "echo",
				description: "echo tool for conversion coverage",
			}),
		);
	});
});
