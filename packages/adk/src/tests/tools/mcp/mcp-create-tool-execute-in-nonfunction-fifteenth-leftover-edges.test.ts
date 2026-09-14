import { describe, expect, it, vi } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

const LONG_DESC = "A meaningful MCP tool description for adapter tests";

/**
 * Fifteenth leftover: `"execute" in mcpTool && typeof === "function"`.
 * Present non-function execute values fail the typeof gate and fall through
 * to toolHandler / client (fifth only covered real function wins).
 */
describe("mcp create-tool execute in-nonfunction fifteenth leftover", () => {
	it.each([
		null,
		"nope",
		0,
		false,
		{},
	] as const)("execute: %j is present via in but not a function → toolHandler used", async (execute) => {
		const toolHandler = vi.fn().mockResolvedValue({ via: "handler" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "exec_nonfn",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				execute,
			} as any,
			toolHandler,
		});

		await expect(tool.runAsync({ q: 1 }, makeContext())).resolves.toEqual({
			via: "handler",
		});
		expect(toolHandler).toHaveBeenCalledWith("exec_nonfn", { q: 1 });
	});

	it("function execute still wins (control)", async () => {
		const execute = vi.fn().mockResolvedValue({ via: "execute" });
		const toolHandler = vi.fn().mockResolvedValue({ via: "handler" });
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "exec_fn",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				execute,
			} as any,
			toolHandler,
		});

		await expect(tool.runAsync({ z: 2 }, makeContext())).resolves.toEqual({
			via: "execute",
		});
		expect(execute).toHaveBeenCalledWith({ z: 2 });
		expect(toolHandler).not.toHaveBeenCalled();
	});
});
