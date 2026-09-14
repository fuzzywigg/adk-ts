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
 * Tenth leftover: text extraction uses `"text" in part` then `part.text || ""`
 * — numeric 0 / false / null become empty; "0" is kept. All-empty joins skip.
 */
describe("output-schema text-in-part falsy || empty tenth leftover edges", () => {
	it("numeric 0 text coalesces to empty and skips when it is the only part", async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: 0 as any }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.content?.parts?.[0]?.text).toBe(0);
		expect(response.errorCode).toBeUndefined();
	});

	it('string "0" is kept and fails schema parse (not skipped)', async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "0" }] },
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

	it("falsy text part is dropped in the join so a sibling JSON part still validates", async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: 0 as any }, { text: '{"v":1}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: schema }),
				response,
			),
		);
		expect(response.errorCode).toBeUndefined();
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			v: 1,
		});
	});

	it('"text" in part with undefined text coalesces to empty', async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: undefined }] },
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
});
