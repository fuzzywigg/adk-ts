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
	name: "debug-residual-deepen",
	description: "toolset debug posinf/nan/object-true twentieth residual deepen",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-debug-residual"],
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
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 true/negzero debug):
 * `if (config.debug)` — POSITIVE_INFINITY / `{}` / `Object(true)` log;
 * `NaN` skips. Skip numeric `1` (eleventh).
 */
describe("mcp toolset debug posinf/nan/object-true twentieth residual deepen", () => {
	it.each([
		{ label: "POSITIVE_INFINITY", debug: Number.POSITIVE_INFINITY },
		{ label: "empty object", debug: {} },
		{ label: "Object(true)", debug: Object(true) },
	])("setSamplingHandler debug $label logs", ({ debug }) => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({ ...baseConfig, debug: debug as any });
		toolset.setSamplingHandler(vi.fn() as any);
		expect(log).toHaveBeenCalledWith(
			expect.stringContaining("Sampling handler set"),
		);
		log.mockRestore();
	});

	it("setSamplingHandler debug NaN skips log via truthiness", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const toolset = new McpToolset({
			...baseConfig,
			debug: Number.NaN as any,
		});
		toolset.setSamplingHandler(vi.fn() as any);
		expect(log).not.toHaveBeenCalledWith(
			expect.stringContaining("Sampling handler set"),
		);
		log.mockRestore();
	});
});
