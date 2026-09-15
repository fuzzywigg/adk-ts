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
	name: "tools-payload-twenty-first-residual",
	description: "toolsResponse.tools residual deepen after tip 5156762",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-tools-21r"],
	},
};

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
	convertMcpToolToBaseTool.mockResolvedValue({
		name: "x",
		description: "x",
	} as any);

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
 * Twenty-first leftover residual deepen (complements #286 nan/posinf):
 * `!tools || !Array.isArray(tools)` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` warn+[].
 */
describe("mcp toolset tools payload string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("tools=$label warns and returns []", async ({ value }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue({ tools: value });
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});
});
