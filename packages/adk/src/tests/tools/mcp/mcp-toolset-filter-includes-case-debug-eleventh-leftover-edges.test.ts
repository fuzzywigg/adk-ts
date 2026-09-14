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
	name: "filter-eleventh",
	description: "array includes case + debug truthiness leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-filter"],
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
 * Eleventh leftover: Array.isArray filter uses includes (case-sensitive);
 * empty array is truthy so it excludes everything. `if (config.debug)` is
 * truthiness — "false"/1 log, ""/0 do not.
 */
describe("McpToolset filter includes case + debug truthiness eleventh leftover", () => {
	it("empty-array filter is truthy and excludes every tool", async () => {
		const toolset = new McpToolset(baseConfig, []);
		await expect(toolset.getTools()).resolves.toEqual([]);
		expect(convertMcpToolToBaseTool).not.toHaveBeenCalled();
	});

	it.each([
		"Alpha",
		"ALPHA",
		"alpha ",
		" alpha",
	])("array filter %j does not match name alpha (case/padding)", async (name) => {
		const toolset = new McpToolset(baseConfig, [name]);
		await expect(toolset.getTools()).resolves.toEqual([]);
	});

	it("exact alpha still includes only that tool", async () => {
		const toolset = new McpToolset(baseConfig, ["alpha"]);
		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["alpha"]);
	});

	it.each([
		{ label: "empty string", debug: "", expectLog: false },
		{ label: "0", debug: 0, expectLog: false },
		{ label: "false", debug: false, expectLog: false },
		{ label: '"false"', debug: "false", expectLog: true },
		{ label: "1", debug: 1, expectLog: true },
	])("setSamplingHandler debug $label logs=$expectLog", ({
		debug,
		expectLog,
	}) => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: debug as any });
		toolset.setSamplingHandler(vi.fn() as any);
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
});
