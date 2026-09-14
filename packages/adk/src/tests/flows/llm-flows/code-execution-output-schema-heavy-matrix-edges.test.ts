import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import {
	requestProcessor as codeExecutionRequestProcessor,
	responseProcessor as codeExecutionResponseProcessor,
} from "../../../flows/llm-flows/code-execution";
import { responseProcessor as outputSchemaResponseProcessor } from "../../../flows/llm-flows/output-schema";
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

describe("output-schema heavy matrix leftover edges", () => {
	it("returns early when response has no content", async () => {
		const events = await collect(
			outputSchemaResponseProcessor.runAsync(
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
			outputSchemaResponseProcessor.runAsync(
				makeContext({ name: "a" }),
				response,
			),
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
			outputSchemaResponseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.content?.parts?.[0]?.text).toContain('"answer"');
		expect(response.content?.parts?.[0]?.text).toContain('"ok"');
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
			outputSchemaResponseProcessor.runAsync(
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
			outputSchemaResponseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			value: 7,
		});
	});

	it("emits an error event when schema validation fails", async () => {
		const schema = z.object({ value: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"value":"nope"}' }],
			},
		});
		const events = await collect(
			outputSchemaResponseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(response.errorCode).toBeDefined();
	});

	it("skips empty whitespace-only text content", async () => {
		const schema = z.object({ value: z.number() });
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "   \n" }] },
		});
		const events = await collect(
			outputSchemaResponseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		expect(events).toEqual([]);
		expect(response.errorCode).toBeUndefined();
	});

	it("joins multiple text parts before parsing", async () => {
		const schema = z.object({ a: z.number(), b: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"a":1,' }, { text: '"b":2}' }],
			},
		});
		await collect(
			outputSchemaResponseProcessor.runAsync(
				makeContext({ name: "schema-agent", outputSchema: schema }),
				response,
			),
		);
		const parsed = JSON.parse(response.content?.parts?.[0]?.text ?? "{}");
		expect(parsed).toEqual({ a: 1, b: 2 });
	});
});

describe("code-execution flow processors heavy matrix leftover edges", () => {
	it("request processor yields no events for agents without code executor", async () => {
		const events = await collect(
			codeExecutionRequestProcessor.runAsync(makeContext({ name: "plain" }), {
				contents: [],
			} as any),
		);
		expect(events).toEqual([]);
	});

	it("response processor yields no events for agents without code executor", async () => {
		const events = await collect(
			codeExecutionResponseProcessor.runAsync(
				makeContext({ name: "plain" }),
				new LlmResponse({
					content: { role: "model", parts: [{ text: "hi" }] },
				}),
			),
		);
		expect(events).toEqual([]);
	});

	it("request processor is safe with empty llm request contents", async () => {
		const llmRequest: any = { contents: undefined };
		const events = await collect(
			codeExecutionRequestProcessor.runAsync(
				makeContext({ name: "plain" }),
				llmRequest,
			),
		);
		expect(events).toEqual([]);
	});
});
