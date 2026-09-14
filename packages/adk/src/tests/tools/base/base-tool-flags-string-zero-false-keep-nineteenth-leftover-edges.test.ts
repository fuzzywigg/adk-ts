import { describe, expect, it } from "vitest";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	async runAsync(_args: Record<string, any>, _context: ToolContext) {
		return { ok: true };
	}
}

/**
 * Nineteenth leftover: BaseTool uses `||` for isLongRunning / shouldRetryOnFailure /
 * maxRetryAttempts — string "0"/"false" are truthy and kept (unlike numeric 0 /
 * boolean false which fifth leftover already pinned to false/3).
 */
describe("base-tool flags string-zero/false keep nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("isLongRunning: %j kept via || (unlike falsy numeric/boolean)", (value) => {
		const tool = new StubTool({
			name: `long_${value}`,
			description: "String truthy isLongRunning keep",
			isLongRunning: value as any,
		});
		expect(tool.isLongRunning).toBe(value);
	});

	it.each([
		"0",
		"false",
	] as const)("shouldRetryOnFailure: %j kept via ||", (value) => {
		const tool = new StubTool({
			name: `retry_${value}`,
			description: "String truthy shouldRetryOnFailure keep",
			shouldRetryOnFailure: value as any,
		});
		expect(tool.shouldRetryOnFailure).toBe(value);
	});

	it.each([
		"0",
		"false",
	] as const)("maxRetryAttempts: %j kept via || (unlike 0/NaN → 3)", (value) => {
		const tool = new StubTool({
			name: `max_${value}`,
			description: "String truthy maxRetryAttempts keep",
			maxRetryAttempts: value as any,
		});
		expect(tool.maxRetryAttempts).toBe(value);
	});

	it("falsy controls still coalesce (fifth residual pin)", () => {
		const tool = new StubTool({
			name: "falsy_ctrl",
			description: "Falsy flag control for nineteenth",
			isLongRunning: 0 as any,
			shouldRetryOnFailure: false as any,
			maxRetryAttempts: Number.NaN as any,
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
