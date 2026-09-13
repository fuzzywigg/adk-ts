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

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
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

describe("output-schema responseProcessor", () => {
	it("returns early when response has no content", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: z.object({}) }),
				new LlmResponse(),
			),
		);
		expect(events).toEqual([]);
	});

	it("returns early when agent has no outputSchema", async () => {
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: '{"a":1}' }] },
		});
		const events = await collect(
			responseProcessor.runAsync(makeContext({ name: "a" }), response),
		);
		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it("validates JSON and rewrites response parts", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"answer":"ok"}' }],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toEqual([]);
		expect(response.content?.parts?.[0]?.text).toContain('"answer"');
		expect(response.content?.parts?.[0]?.text).toContain('"ok"');
		expect(response.errorCode).toBeUndefined();
	});

	it("strips markdown fences before parsing", async () => {
		const schema = z.object({ value: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```json\n{"value": 42}\n```' }],
			},
		});

		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			value: 42,
		});
	});

	it("repairs mildly invalid JSON", async () => {
		const schema = z.object({ value: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "{value: 7}" }],
			},
		});

		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			value: 7,
		});
	});

	it("yields an error event when schema validation fails", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"answer":123}' }],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
		expect(response.errorMessage).toContain("schema-agent");
		const event = events[0] as {
			errorCode?: string;
			content?: { parts?: { text?: string }[] };
		};
		expect(event.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
		expect(event.content?.parts?.[0]?.text).toContain("Error:");
	});

	it("skips whitespace-only content", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "   \n  " }] },
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it("strips prose before the first JSON object", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: 'Here\'s the JSON:\n{"answer":"yes"}' }],
			},
		});

		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			answer: "yes",
		});
	});

	it("yields a parse error when JSON cannot be repaired", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "not-json-at-all {{{" }],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
		expect(response.errorMessage).toMatch(/JSON|parse|Unexpected/i);
	});

	it("ignores non-text parts when joining response text", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [
					{ inlineData: { mimeType: "image/png", data: "abc" } } as any,
					{ text: '{"answer":"ok"}' },
				],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
		const texts = (response.content?.parts || [])
			.map((part) => ("text" in (part || {}) ? part.text : undefined))
			.filter((t): t is string => Boolean(t));
		expect(texts.some((t) => JSON.parse(t).answer === "ok")).toBe(true);
		expect(response.content?.parts?.[0]).toMatchObject({
			inlineData: { mimeType: "image/png", data: "abc" },
		});
	});

	it("strips unlabeled triple-backtick fences", async () => {
		const schema = z.object({ n: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```\n{"n": 3}\n```' }],
			},
		});

		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			n: 3,
		});
	});

	it("parses array JSON starting after prose", async () => {
		const schema = z.array(z.object({ id: z.number() }));
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: 'Result list:\n[{"id":1},{"id":2}]' }],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toEqual([]);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "[]")).toEqual([
			{ id: 1 },
			{ id: 2 },
		]);
	});

	it("joins text across multiple parts before validation", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"ans' }, { text: 'wer":"split"}' }],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toEqual([]);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			answer: "split",
		});
		expect(JSON.parse(response.content?.parts?.[1]?.text ?? "{}")).toEqual({
			answer: "split",
		});
	});

	it("returns early for empty parts array", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: { role: "model", parts: [] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it("returns early when outputSchema is falsy", async () => {
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: '{"a":1}' }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: null }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it("preserves non-Error throw messages on validation failure", async () => {
		const schema = {
			parse: () => {
				throw "plain failure";
			},
		};
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"answer":"ok"}' }],
			},
		});

		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);

		expect(events).toHaveLength(1);
		expect(response.errorMessage).toContain("plain failure");
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});
});
