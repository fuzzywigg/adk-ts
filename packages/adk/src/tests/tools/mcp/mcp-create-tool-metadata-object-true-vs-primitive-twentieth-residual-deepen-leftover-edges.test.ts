import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

const LONG_DESC = "A meaningful MCP tool description for adapter tests";

/**
 * HEAVY tip-relaunch residual deepen after tip 1f70668 / post #286 (lands closed
 * #278 onto tip; complements fourteenth array metadata): `"metadata" in … &&
 * typeof metadata === "object"` — `Object(true)` / `Object(1)` are objects so
 * they win over `_meta` (flags default via ??); primitive `true` / `1` are
 * non-objects and fall through to `_meta`.
 */
describe("mcp create-tool metadata object-true vs primitive twentieth residual deepen", () => {
	it("metadata: Object(true) is typeof object so _meta is ignored; flags default", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "boxed_true_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: Object(true),
				_meta: {
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 9,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("metadata: Object(1) is typeof object so _meta is ignored; flags default", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "boxed_one_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: Object(1),
				_meta: {
					isLongRunning: true,
					maxRetryAttempts: 7,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("metadata: primitive true falls through to _meta (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "prim_true_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: true,
				_meta: {
					isLongRunning: true,
					maxRetryAttempts: 5,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.maxRetryAttempts).toBe(5);
	});

	it("metadata: primitive 1 falls through to _meta (control)", async () => {
		const tool = await convertMcpToolToBaseTool({
			mcpTool: {
				name: "prim_one_meta",
				description: LONG_DESC,
				inputSchema: { type: "object", properties: {} },
				metadata: 1,
				_meta: {
					shouldRetryOnFailure: true,
					maxRetryAttempts: 4,
				},
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(4);
	});
});
