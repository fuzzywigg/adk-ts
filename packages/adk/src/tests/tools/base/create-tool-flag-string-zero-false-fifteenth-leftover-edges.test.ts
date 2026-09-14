import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";

/**
 * Fifteenth leftover: createTool `??` then BaseTool `||` for flags —
 * fourteenth pins `""`→false and `"yes"` keep. String `"0"` / `"false"` are
 * truthy and kept (asymmetry vs numeric 0 / boolean false → false).
 */
describe("create-tool flag string-zero-false keep fifteenth leftover", () => {
	it.each([
		"0",
		"false",
	])('isLongRunning/shouldRetryOnFailure "%s" kept as truthy string', (value) => {
		const tool = createTool({
			name: `flag_${value}`,
			description: "String-zero-false flag through createTool then BaseTool",
			isLongRunning: value as any,
			shouldRetryOnFailure: value as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(value);
		expect(tool.shouldRetryOnFailure).toBe(value);
	});

	it("numeric 0 still coerces to false via BaseTool || (control)", () => {
		const tool = createTool({
			name: "flag_num_zero",
			description: "Numeric zero flag through createTool then BaseTool",
			isLongRunning: 0 as any,
			shouldRetryOnFailure: 0 as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});
});
