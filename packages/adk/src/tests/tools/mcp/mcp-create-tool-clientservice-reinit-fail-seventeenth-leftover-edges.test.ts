import { afterEach, describe, expect, it, vi } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";
import { McpError, McpErrorType } from "../../../tools/mcp/types";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

/**
 * Seventeenth leftover (session error path): when the client is a
 * `McpClientService`-shaped object (`reinitialize` function present),
 * `runAsync` delegates to `clientService.callTool`. If that path's closed-
 * session reinit fails, the adapter surfaces TOOL_EXECUTION_ERROR — distinct
 * from plain-client cannot-reinitialize warn leftovers and from #220 meta-null.
 */
describe("mcp-create-tool clientservice reinit fail seventeenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("clientService.callTool reinit failure wraps as TOOL_EXECUTION_ERROR", async () => {
		const callTool = vi.fn(async () => {
			throw new Error(
				'Error calling tool "svc_tool": Failed to reinitialize resources: Error: reconnect refused',
			);
		});
		const reinitialize = vi.fn(async () => {
			throw new Error("should not be called by adapter directly");
		});
		vi.spyOn(console, "error").mockImplementation(() => {});

		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "svc_tool",
				description: "clientService reinit fail leftover",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize } as any,
		});

		await expect(tool.runAsync({ a: 1 }, makeContext())).rejects.toMatchObject({
			name: "McpError",
			type: McpErrorType.TOOL_EXECUTION_ERROR,
			message: expect.stringContaining("Failed to reinitialize resources"),
		});
		expect(callTool).toHaveBeenCalledWith("svc_tool", { a: 1 });
		expect(reinitialize).not.toHaveBeenCalled();
	});

	it("clientService path rethrows existing McpError without re-wrap", async () => {
		const typed = new McpError("already typed", McpErrorType.CONNECTION_ERROR);
		const callTool = vi.fn(async () => {
			throw typed;
		});
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "typed_svc",
				description: "clientService McpError passthrough leftover",
				inputSchema: { type: "object", properties: {} },
			} as any,
			client: { callTool, reinitialize: vi.fn() } as any,
		});

		await expect(tool.runAsync({}, makeContext())).rejects.toBe(typed);
	});
});
