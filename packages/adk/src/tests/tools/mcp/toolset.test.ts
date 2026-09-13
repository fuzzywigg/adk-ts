import { describe, expect, it, vi } from "vitest";
import { McpToolset } from "../../../tools/mcp";
import { McpErrorType } from "../../../tools/mcp/types";

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
});
