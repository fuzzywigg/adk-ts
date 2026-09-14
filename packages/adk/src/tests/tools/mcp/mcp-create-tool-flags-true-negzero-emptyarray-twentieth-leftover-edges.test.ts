import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after fourteenth zero-nullish):
 * metadata flags use `??` then BaseTool `||`. Boolean `true` / `"true"` /
 * `[]` / `NEGATIVE_INFINITY` survive both; SameValueZero `-0` survives `??`
 * then collapses at BaseTool `||`. Fourteenth pinned numeric `0` / nullish only.
 */
describe("mcp create-tool flags true/negzero/emptyarray twentieth leftover", () => {
	async function flags(metadata: Record<string, unknown>) {
		return convertMcpToolToBaseTool({
			mcpTool: {
				name: "flag_tool",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata,
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
	}

	it("isLongRunning/shouldRetry/maxRetry: boolean true kept via ?? then ||", async () => {
		const tool = await flags({
			isLongRunning: true,
			shouldRetryOnFailure: true,
			maxRetryAttempts: true,
		});
		expect(tool.isLongRunning).toBe(true);
		expect(tool.shouldRetryOnFailure).toBe(true);
		expect(tool.maxRetryAttempts).toBe(true);
	});

	it('isLongRunning/shouldRetry/maxRetry: "true" kept (truthy string)', async () => {
		const tool = await flags({
			isLongRunning: "true",
			shouldRetryOnFailure: "true",
			maxRetryAttempts: "true",
		});
		expect(tool.isLongRunning).toBe("true");
		expect(tool.shouldRetryOnFailure).toBe("true");
		expect(tool.maxRetryAttempts).toBe("true");
	});

	it("isLongRunning/shouldRetry/maxRetry: [] kept (truthy empty array)", async () => {
		const empty: never[] = [];
		const tool = await flags({
			isLongRunning: empty,
			shouldRetryOnFailure: empty,
			maxRetryAttempts: empty,
		});
		expect(tool.isLongRunning).toBe(empty);
		expect(tool.shouldRetryOnFailure).toBe(empty);
		expect(tool.maxRetryAttempts).toBe(empty);
	});

	it("isLongRunning/shouldRetry/maxRetry: NEGATIVE_INFINITY kept", async () => {
		const tool = await flags({
			isLongRunning: Number.NEGATIVE_INFINITY,
			shouldRetryOnFailure: Number.NEGATIVE_INFINITY,
			maxRetryAttempts: Number.NEGATIVE_INFINITY,
		});
		expect(tool.isLongRunning).toBe(Number.NEGATIVE_INFINITY);
		expect(tool.shouldRetryOnFailure).toBe(Number.NEGATIVE_INFINITY);
		expect(tool.maxRetryAttempts).toBe(Number.NEGATIVE_INFINITY);
	});

	it("isLongRunning/shouldRetry: -0 survives ?? then BaseTool || false → false", async () => {
		const tool = await flags({
			isLongRunning: -0,
			shouldRetryOnFailure: -0,
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("maxRetryAttempts: -0 survives ?? then BaseTool || 3 → 3", async () => {
		const tool = await flags({ maxRetryAttempts: -0 });
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
