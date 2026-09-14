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
	name: "close-error-leave-17",
	description: "close error leaves client/tools session lifecycle leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-life"],
	},
};

/**
 * Seventeenth leftover (error path asymmetry): when `clientService.close()`
 * throws, `McpToolset.close` logs but does NOT null `clientService` or clear
 * `tools` (those assignments sit after the await). Success path clears both.
 * Distinct from #220 MCP leftovers and prior lifecycle debug-log coverage.
 */
describe("mcp-toolset close error leaves client tools seventeenth leftover", () => {
	beforeEach(() => {
		initialize.mockReset();
		close.mockReset();
		setSamplingHandler.mockReset();
		removeSamplingHandler.mockReset();
		listTools.mockReset();
		convertMcpToolToBaseTool.mockReset();
		McpClientServiceMock.mockReset();

		initialize.mockResolvedValue(undefined);
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

	it("close error leaves clientService and tools; only isClosing is cleared", async () => {
		close.mockRejectedValue(new Error("close boom"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);
		const cached = { name: "cached", description: "cached tool" } as any;
		(toolset as any).tools = [cached];
		const priorClient = (toolset as any).clientService;

		await expect(toolset.close()).resolves.toBeUndefined();

		expect(errorSpy).toHaveBeenCalledWith(
			"Error closing MCP toolset:",
			expect.any(Error),
		);
		expect((toolset as any).isClosing).toBe(false);
		expect((toolset as any).clientService).toBe(priorClient);
		expect((toolset as any).tools).toEqual([cached]);
		errorSpy.mockRestore();
	});

	it("successful close nulls clientService and clears tools (control)", async () => {
		close.mockResolvedValue(undefined);
		const toolset = new McpToolset(baseConfig);
		(toolset as any).tools = [{ name: "x" }];

		await toolset.close();

		expect((toolset as any).clientService).toBeNull();
		expect((toolset as any).tools).toEqual([]);
		expect((toolset as any).isClosing).toBe(false);
	});
});
