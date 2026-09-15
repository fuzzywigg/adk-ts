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
	name: "tools-payload-twentieth-heavy",
	description: "toolsResponse.tools residual heavy after providers #269",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-tools-20h"],
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
 * Twentieth leftover (HEAVY tip-relaunch residual after providers tip #269):
 * `!tools || !Array.isArray(tools)` — complements closed #271 true/`"true"` /
 * `-0`/`-Infinity` warn+[] with `POSITIVE_INFINITY` / `NaN` / `Object(true)` /
 * `1` warn+[].
 */
describe("mcp toolset tools payload nan/posinf twentieth leftover heavy", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NaN", value: Number.NaN },
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
	])("tools=$label warns and returns []", async ({ value }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		listTools.mockResolvedValue({ tools: value });
		const toolset = new McpToolset(baseConfig);
		expect(await toolset.getTools()).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});
});
