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

const { McpToolset } = await import("../../../tools/mcp");

const baseConfig = {
	name: "convert-mcperror-17",
	description: "getTools McpError conversion continue leftover",
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
 * Seventeenth leftover (error path): per-tool conversion throwing `McpError`
 * is still caught and skipped (same console.error path as raw Error) so other
 * tools remain — residual beyond raw Error coverage in toolset.test.
 */
describe("mcp-toolset gettools conversion mcperror continue seventeenth leftover", () => {
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
					name: "bad",
					description: "fails as McpError",
					inputSchema: { type: "object", properties: {} },
				},
				{
					name: "good",
					description: "ok",
					inputSchema: { type: "object", properties: {} },
				},
			],
		});
		convertMcpToolToBaseTool.mockImplementation(async ({ mcpTool }: any) => {
			if (mcpTool.name === "bad") {
				throw new McpError(
					"typed schema fail",
					McpErrorType.INVALID_SCHEMA_ERROR,
				);
			}
			return fakeBaseTool(mcpTool.name);
		});
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

	it("skips McpError conversion failures and returns remaining tools", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const toolset = new McpToolset(baseConfig);
		const tools = await toolset.getTools();

		expect(tools.map((t) => t.name)).toEqual(["good"]);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Failed to create tool from MCP tool "bad"'),
			expect.any(McpError),
		);
		errorSpy.mockRestore();
	});
});
