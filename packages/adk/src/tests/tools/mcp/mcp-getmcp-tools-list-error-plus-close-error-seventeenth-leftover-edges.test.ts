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

const { McpToolset, getMcpTools } = await import("../../../tools/mcp");
const { McpError, McpErrorType } = await import("../../../tools/mcp/types");

const baseConfig = {
	name: "getmcp-close-err-17",
	description: "getMcpTools finally close error leftover",
	transport: {
		mode: "stdio" as const,
		command: "npx",
		args: ["-y", "@example/mcp-life"],
	},
};

function fakeBaseTool(name: string) {
	return { name, description: `${name} tool` } as any;
}

/**
 * Seventeenth leftover (error path): `getMcpTools` finally always attempts
 * `close().catch(...)`. When getTools throws McpError AND close also rejects,
 * the original list error still propagates (close error only logged).
 */
describe("mcp-getmcp-tools list error plus close error seventeenth leftover", () => {
	beforeEach(() => {
		initialize.mockReset();
		close.mockReset();
		setSamplingHandler.mockReset();
		removeSamplingHandler.mockReset();
		listTools.mockReset();
		convertMcpToolToBaseTool.mockReset();
		McpClientServiceMock.mockReset();

		initialize.mockResolvedValue(undefined);
		listTools.mockRejectedValue(
			new McpError("list typed fail", McpErrorType.CONNECTION_ERROR),
		);
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

	it("propagates list McpError when finally close also rejects", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const closeSpy = vi
			.spyOn(McpToolset.prototype, "close")
			.mockRejectedValue(new Error("finally close boom"));

		try {
			await expect(getMcpTools(baseConfig)).rejects.toMatchObject({
				type: McpErrorType.CONNECTION_ERROR,
				message: "list typed fail",
			});
			expect(errorSpy).toHaveBeenCalledWith(
				"Error closing toolset:",
				expect.any(Error),
			);
		} finally {
			closeSpy.mockRestore();
			errorSpy.mockRestore();
		}
	});
});
