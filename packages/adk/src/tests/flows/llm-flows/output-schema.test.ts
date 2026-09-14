import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
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

	it("treats empty-string text parts as empty when joining response text", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [
					{ text: "" },
					{ text: '{"answer":"ok"}' },
					{ text: undefined as any },
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
		expect(JSON.parse(response.content?.parts?.[1]?.text ?? "{}")).toEqual({
			answer: "ok",
		});
	});

	it("truncates long responseContent in validation error logging", async () => {
		const schema = z.object({ answer: z.string() });
		const longInvalid = `{"nope":"${"x".repeat(220)}"}`;
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: longInvalid }],
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
		expect(response.errorMessage).toBeTruthy();
		expect(longInvalid.length).toBeGreaterThan(200);
	});

	it("joins multiple valid text fragments before parsing", async () => {
		const schema = z.object({ answer: z.string(), n: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"answer":' }, { text: '"joined","n":3}' }],
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
			answer: "joined",
			n: 3,
		});
	});

	it("still validates partial streaming responses when content is present", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			partial: true,
			content: {
				role: "model",
				parts: [{ text: '{"answer":"partial"}' }],
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
			answer: "partial",
		});
	});
});

describe("output-schema responseProcessor leftover edges", () => {
	it("validates nested object schemas and pretty-prints the result", async () => {
		const schema = z.object({
			user: z.object({ id: z.number(), name: z.string() }),
		});
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"user":{"id":1,"name":"Ada"}}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "nested", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			user: { id: 1, name: "Ada" },
		});
	});

	it("yields validation error for array schema type mismatches", async () => {
		const schema = z.array(z.number());
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '[1,"two",3]' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "arr-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});

	it("error events include invocationId and branch from context", async () => {
		const schema = z.object({ ok: z.boolean() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: '{"ok":"nope"}' }] },
		});
		const events = await collect(
			responseProcessor.runAsync(
				{
					invocationId: "inv-edge",
					branch: "feature/x",
					agent: { name: "edge-agent", outputSchema: schema },
				} as InvocationContext,
				response,
			),
		);
		const event = events[0] as Event;
		expect(event.invocationId).toBe("inv-edge");
		expect(event.branch).toBe("feature/x");
		expect(event.author).toBe("edge-agent");
	});

	it("returns early when joined text is only whitespace and newlines", async () => {
		const schema = z.object({ a: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "  \n\t  " }, { text: "   " }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "ws-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it("strips ```JSON fenced blocks case-insensitively", async () => {
		const schema = z.object({ n: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```JSON\n{"n":9}\n```' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "fence-agent", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			n: 9,
		});
	});

	it("returns early when llmResponse is nullish", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "a", outputSchema: z.object({}) }),
				null as any,
			),
		);
		expect(events).toEqual([]);
	});

	it("repairs trailing commas in JSON via jsonrepair", async () => {
		const schema = z.object({ n: z.number(), label: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"n": 3, "label": "ok",}' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "repair-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			n: 3,
			label: "ok",
		});
	});

	it("leaves non-text parts unchanged while rewriting text parts", async () => {
		const schema = z.object({ ok: z.boolean() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [
					{ functionCall: { name: "noop", args: {} } } as any,
					{ text: '{"ok":true}' },
				],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "mixed-parts", outputSchema: schema }),
				response,
			),
		);
		expect((response.content?.parts?.[0] as any).functionCall).toEqual({
			name: "noop",
			args: {},
		});
		expect(JSON.parse(response.content?.parts?.[1]?.text ?? "{}")).toEqual({
			ok: true,
		});
	});

	it("strips prose before JSON when no fences are present", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: 'Here is the result:\n{"answer":"yes"}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "prose-agent", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			answer: "yes",
		});
	});
});

describe("output-schema responseProcessor leftover edges (post #124)", () => {
	it("falls through empty fenced blocks to prose/raw trimming", async () => {
		const schema = z.object({ n: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```json\n```\n{"n":7}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "empty-fence", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			n: 7,
		});
	});

	it("falls through whitespace-only fences to following JSON lines", async () => {
		const schema = z.object({ ok: z.boolean() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```\n   \n```\n{"ok":true}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "ws-fence", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			ok: true,
		});
	});
});
