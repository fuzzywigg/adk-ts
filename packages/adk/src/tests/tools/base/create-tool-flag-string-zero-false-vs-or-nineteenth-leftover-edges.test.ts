import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";

/**
 * Nineteenth leftover: createTool uses `??` then BaseTool uses `||` — string
 * "0"/"false" survive both (fourteenth only pinned "" → false and "yes" keep).
 */
describe("create-tool flag string-zero/false vs or nineteenth leftover", () => {
	it.each([
		"0",
		"false",
	] as const)("isLongRunning/shouldRetryOnFailure: %j survives ?? then ||", (value) => {
		const tool = createTool({
			name: `flag_${value}`,
			description: "String truthy flags through createTool then BaseTool",
			isLongRunning: value as any,
			shouldRetryOnFailure: value as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(value);
		expect(tool.shouldRetryOnFailure).toBe(value);
	});

	it.each([
		"0",
		"false",
	] as const)("maxRetryAttempts: %j survives ?? then || (kept as string)", (value) => {
		const tool = createTool({
			name: `max_${value}`,
			description: "String truthy maxRetryAttempts through createTool",
			maxRetryAttempts: value as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		expect(tool.maxRetryAttempts).toBe(value);
	});

	it("empty string still survives ?? then || coerces to false (fourteenth control)", () => {
		const tool = createTool({
			name: "flag_empty_ctrl",
			description: "Empty string flag control for nineteenth",
			isLongRunning: "" as any,
			shouldRetryOnFailure: "" as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});
});
