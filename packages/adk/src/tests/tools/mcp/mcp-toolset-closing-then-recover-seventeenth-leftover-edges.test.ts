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
const { McpErrorType } = await import("../../../tools/mcp/types");

const baseConfig = {
	name: "toolset-closing-recover-17",
	description: "toolset initialize while closing recover leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-life"],
	},
};

/**
 * Seventeenth leftover (session lifecycle): toolset `isClosing` blocks
 * initialize/getTools with RESOURCE_CLOSED_ERROR; after successful close
 * clears the flag, a later initialize recreates the session.
 */
describe("mcp-toolset closing then recover seventeenth leftover", () => {
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

	it("rejects while closing then succeeds after close clears isClosing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;

		await expect(toolset.initialize()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
			message: expect.stringContaining("toolset that is being closed"),
		});
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
		expect(initialize).not.toHaveBeenCalled();

		// Simulate close completing (finally clears isClosing) without awaiting
		// the early-return path while still marked closing.
		(toolset as any).isClosing = false;
		await toolset.close();
		expect((toolset as any).isClosing).toBe(false);
		expect((toolset as any).clientService).toBeNull();

		McpClientServiceMock.mockClear();
		initialize.mockClear();
		await toolset.initialize();
		expect(McpClientServiceMock).toHaveBeenCalledTimes(1);
		expect(initialize).toHaveBeenCalledTimes(1);
	});
});
