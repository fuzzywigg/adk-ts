import { beforeEach, describe, expect, it, vi } from "vitest";
import { McpToolset } from "../../../tools/mcp";
import { McpErrorType } from "../../../tools/mcp/types";

const convertMcpToolToBaseTool = vi.hoisted(() =>
	vi.fn(async ({ mcpTool }: { mcpTool: { name: string } }) => {
		if (mcpTool.name === "bad") {
			throw new Error("convert failed");
		}
		return { name: mcpTool.name } as any;
	}),
);

vi.mock("../../../tools/mcp/create-tool", () => ({
	convertMcpToolToBaseTool,
}));

describe("McpToolset offline helpers", () => {
	const baseConfig = {
		name: "unit",
		description: "unit test toolset with enough description length",
		transport: {
			mode: "stdio" as const,
			command: "npx",
			args: ["-y", "@example/mcp"],
		},
	};

	beforeEach(() => {
		convertMcpToolToBaseTool.mockClear();
	});

	it("isSelected includes all tools when no filter is set", () => {
		const toolset = new McpToolset(baseConfig);
		expect((toolset as any).isSelected({ name: "a" })).toBe(true);
		expect((toolset as any).isSelected({ name: "b" })).toBe(true);
	});

	it("isSelected honors array and predicate filters", () => {
		const byName = new McpToolset(baseConfig, ["keep"]);
		expect((byName as any).isSelected({ name: "keep" })).toBe(true);
		expect((byName as any).isSelected({ name: "drop" })).toBe(false);

		const byFn = new McpToolset(baseConfig, (tool: { name: string }) =>
			tool.name.startsWith("ok_"),
		);
		expect((byFn as any).isSelected({ name: "ok_one" })).toBe(true);
		expect((byFn as any).isSelected({ name: "nope" })).toBe(false);
	});

	it("convertADKToolsToMCP maps tool declarations", () => {
		const toolset = new McpToolset(baseConfig);
		const tools = [
			{
				name: "echo",
				description: "echoes input for testing conversion paths",
				getDeclaration() {
					return {
						name: "echo",
						description: "echoes input for testing conversion paths",
						parameters: {
							type: "OBJECT",
							properties: {
								text: { type: "STRING" },
							},
						},
					};
				},
			},
		] as any;

		const converted = toolset.convertADKToolsToMCP(tools);
		expect(converted[0]).toEqual(
			expect.objectContaining({
				name: "echo",
				description: "echoes input for testing conversion paths",
			}),
		);
	});

	it("getTools rejects when closing", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).isClosing = true;
		await expect(toolset.getTools()).rejects.toMatchObject({
			type: McpErrorType.RESOURCE_CLOSED_ERROR,
		});
	});

	it("close and dispose are idempotent", async () => {
		const toolset = new McpToolset(baseConfig);
		const closeSpy = vi
			.spyOn((toolset as any).clientService, "close")
			.mockResolvedValue(undefined);

		await toolset.close();
		await toolset.close();
		await toolset.dispose();

		expect(closeSpy).toHaveBeenCalled();
	});

	it("refreshTools clears cached tools before refetch", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).tools = [{ name: "cached" }];
		const getTools = vi
			.spyOn(toolset, "getTools")
			.mockResolvedValue([{ name: "fresh" } as any]);

		const result = await toolset.refreshTools();
		expect((toolset as any).tools).toEqual([]);
		expect(getTools).toHaveBeenCalled();
		expect(result).toEqual([{ name: "fresh" }]);
	});

	it("getTools returns empty array when listTools payload is invalid", async () => {
		const toolset = new McpToolset(baseConfig);
		(toolset as any).clientService = {
			initialize: vi.fn().mockResolvedValue({
				listTools: vi.fn().mockResolvedValue({ tools: null }),
			}),
		};
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await expect(toolset.getTools()).resolves.toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("getTools filters tools, skips convert failures, and wraps unexpected errors", async () => {
		const toolset = new McpToolset(baseConfig, ["keep", "bad"]);
		(toolset as any).clientService = {
			initialize: vi.fn().mockResolvedValue({
				listTools: vi.fn().mockResolvedValue({
					tools: [
						{ name: "keep", description: "keep tool with enough text" },
						{ name: "bad", description: "bad tool with enough text" },
						{ name: "drop", description: "filtered out tool description" },
					],
				}),
			}),
		};
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const tools = await toolset.getTools();
		expect(tools.map((t) => t.name)).toEqual(["keep"]);
		expect(errorSpy).toHaveBeenCalled();
		expect(convertMcpToolToBaseTool).toHaveBeenCalledTimes(2);

		const failing = new McpToolset(baseConfig);
		(failing as any).clientService = {
			initialize: vi.fn().mockRejectedValue(new Error("socket dead")),
		};
		await expect(failing.getTools()).rejects.toMatchObject({
			type: McpErrorType.CONNECTION_ERROR,
			message: expect.stringContaining("socket dead"),
		});

		errorSpy.mockRestore();
	});
});
