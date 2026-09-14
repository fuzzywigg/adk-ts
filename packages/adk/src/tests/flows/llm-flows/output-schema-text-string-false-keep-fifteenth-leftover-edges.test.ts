import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import { responseProcessor } from "../../../flows/llm-flows/output-schema";
import { LlmResponse } from "../../../models/llm-response";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function collect(gen: AsyncGenerator<unknown, void, unknown>) {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeContext(agent: Record<string, unknown>): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent,
	} as unknown as InvocationContext;
}

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #254 / 96457a9): tenth leftover pins `part.text || ""` keeping `"0"` and
 * dropping numeric 0. String `"false"` is also kept (truthy) so schema parse
 * runs instead of the all-empty skip.
 */
describe("output-schema text string-false keep fifteenth leftover", () => {
	it('string "false" is kept and fails schema parse (not skipped)', async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "false" }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: schema }),
				response,
			),
		);
		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});

	it("boolean false text coalesces to empty and skips", async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: false as any }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it('sibling "false" + JSON still joins with kept string prefix', async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "false" }, { text: '{"v":1}' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: schema }),
				response,
			),
		);
		// Joined "false{\"v\":1}" is not valid JSON → validation error event
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});
});
