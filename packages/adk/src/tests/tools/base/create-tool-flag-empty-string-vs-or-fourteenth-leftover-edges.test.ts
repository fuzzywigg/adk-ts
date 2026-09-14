import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";

/**
 * Fourteenth leftover: createTool uses `??` then BaseTool uses `||` for flags —
 * empty string survives ?? then coerces to false via ||; truthy string stays true.
 */
describe("create-tool flag empty-string vs or fourteenth leftover", () => {
	it('isLongRunning: "" survives ?? then BaseTool || coerces to false', () => {
		const tool = createTool({
			name: "flag_empty",
			description: "Empty string flag through createTool then BaseTool",
			isLongRunning: "" as any,
			shouldRetryOnFailure: "" as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it('isLongRunning: "yes" survives ?? and || as truthy string (not boolean true)', () => {
		const tool = createTool({
			name: "flag_yes",
			description: "Truthy string flag through createTool then BaseTool",
			isLongRunning: "yes" as any,
			shouldRetryOnFailure: "yes" as any,
			schema: z.object({}),
			fn: () => ({ ok: true }),
		});
		// || keeps the truthy operand — does not coerce to boolean true
		expect(tool.isLongRunning).toBe("yes");
		expect(tool.shouldRetryOnFailure).toBe("yes");
	});
});
