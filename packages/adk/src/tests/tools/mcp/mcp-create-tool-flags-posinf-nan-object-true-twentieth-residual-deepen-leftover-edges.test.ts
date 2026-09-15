import { describe, expect, it } from "vitest";
import { convertMcpToolToBaseTool } from "../../../tools/mcp/create-tool";

/**
 * HEAVY tip-relaunch residual deepen after tip 5156762 / post #292 (lands closed #290/#278 onto tip; complements #259 true/negzero flags):
 * metadata flags `??` then BaseTool `||` — POSITIVE_INFINITY / `1` / `{}` /
 * `Object(true)` survive both; `NaN` survives `??` then collapses at `||`
 * (distinct from `-0` SameValueZero label in twentieth).
 */
describe("mcp create-tool flags posinf/nan/object-true twentieth residual deepen", () => {
	async function flags(metadata: Record<string, unknown>) {
		return convertMcpToolToBaseTool({
			mcpTool: {
				name: "flag_residual",
				description: "meaningful description",
				inputSchema: { type: "object", properties: {} },
				metadata,
			} as any,
			toolHandler: async () => ({ content: [] }),
		});
	}

	it.each([
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "number 1", value: 1 },
		{ label: "empty object", value: {} },
		{ label: "Object(true)", value: Object(true) },
	])("flags $label kept via ?? then ||", async ({ value }) => {
		const tool = await flags({
			isLongRunning: value,
			shouldRetryOnFailure: value,
			maxRetryAttempts: value,
		});
		expect(tool.isLongRunning).toBe(value);
		expect(tool.shouldRetryOnFailure).toBe(value);
		expect(tool.maxRetryAttempts).toBe(value);
	});

	it("isLongRunning/shouldRetry: NaN survives ?? then BaseTool || false → false", async () => {
		const tool = await flags({
			isLongRunning: Number.NaN,
			shouldRetryOnFailure: Number.NaN,
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("maxRetryAttempts: NaN survives ?? then BaseTool || 3 → 3", async () => {
		const tool = await flags({ maxRetryAttempts: Number.NaN });
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
