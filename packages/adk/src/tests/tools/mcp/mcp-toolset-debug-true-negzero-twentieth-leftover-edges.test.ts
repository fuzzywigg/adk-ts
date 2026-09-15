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
	name: "debug-twentieth",
	description: "toolset debug true/negzero twentieth residual",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-debug"],
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
	listTools.mockResolvedValue({ tools: [] });
	convertMcpToolToBaseTool.mockResolvedValue({
		name: "t",
		description: "t tool",
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
 * Twentieth leftover (HEAVY tip-relaunch residual after eleventh debug truthiness):
 * `if (config.debug)` keeps boolean `true` / `"true"` / `[]` /
 * `NEGATIVE_INFINITY`; SameValueZero `-0` skips. Eleventh pinned classic
 * falsy plus `"false"`/`1` only.
 */
describe("mcp toolset debug true/negzero twentieth leftover", () => {
	it.each([
		{ label: "boolean true", debug: true },
		{ label: '"true"', debug: "true" },
		{ label: "empty array", debug: [] as never[] },
		{ label: "NEGATIVE_INFINITY", debug: Number.NEGATIVE_INFINITY },
	])("setSamplingHandler debug $label logs", ({ debug }) => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: debug as any });
		toolset.setSamplingHandler(vi.fn() as any);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Sampling handler set"),
		);
		log.mockRestore();
	});

	it("setSamplingHandler debug -0 skips log via truthiness", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: -0 as any });
		toolset.setSamplingHandler(vi.fn() as any);
		expect(log).not.toHaveBeenCalledWith(
			expect.stringContaining("Sampling handler set"),
		);
		log.mockRestore();
	});
});
