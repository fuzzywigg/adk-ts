import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../agents/invocation-context";
import { responseProcessor } from "../../flows/llm-flows/output-schema";
import type { LlmResponse } from "../../models/llm-response";

async function drain(gen: AsyncGenerator<unknown>) {
	const events = [];
	for await (const event of gen) {
		events.push(event);
	}
	return events;
}

function makeCtx(schema: z.ZodTypeAny, name = "schema-agent") {
	return {
		invocationId: "inv-out",
		branch: "main",
		agent: { name, outputSchema: schema },
	} as InvocationContext;
}

describe('output-schema strip fences / array-start / text||"" fifth leftover (post #165)', () => {
	it.each([
		{
			label: "non-text parts only",
			parts: [{ inlineData: { data: "x" } }],
			expectEvents: 0,
		},
		{ label: "empty text", parts: [{ text: "" }], expectEvents: 0 },
		{ label: "whitespace text", parts: [{ text: "  \n\t " }], expectEvents: 0 },
		{
			label: 'text || "" joins mixed parts',
			parts: [{ text: undefined }, { text: null }, { text: '{"a":1}' }],
			expectEvents: 0,
			expectValidated: true,
		},
	] as const)("skips or validates: $label", async ({
		parts,
		expectEvents,
		expectValidated,
	}) => {
		const schema = z.object({ a: z.number() });
		const llmResponse: LlmResponse = {
			content: { role: "model", parts: parts as any },
		};
		const events = await drain(
			responseProcessor.runAsync(makeCtx(schema), llmResponse),
		);
		expect(events).toHaveLength(expectEvents);
		if (expectValidated) {
			expect(
				llmResponse.content?.parts?.some(
					(p: any) => typeof p.text === "string" && p.text.includes('"a"'),
				),
			).toBe(true);
		}
	});

	it("strips prose before array JSON via startsWith('[')", async () => {
		const schema = z.array(z.number());
		const llmResponse: LlmResponse = {
			content: {
				role: "model",
				parts: [{ text: "Here is the data:\n[1, 2, 3]\nthanks" }],
			},
		};
		const events = await drain(
			responseProcessor.runAsync(makeCtx(schema), llmResponse),
		);
		expect(events).toHaveLength(0);
		const text = (llmResponse.content?.parts?.[0] as any).text as string;
		expect(JSON.parse(text)).toEqual([1, 2, 3]);
	});

	it("prefers fenced ```json block over surrounding prose", async () => {
		const schema = z.object({ ok: z.boolean() });
		const llmResponse: LlmResponse = {
			content: {
				role: "model",
				parts: [
					{
						text: 'noise\n```json\n{"ok": true}\n```\nmore noise {"ok": false}',
					},
				],
			},
		};
		await drain(responseProcessor.runAsync(makeCtx(schema), llmResponse));
		expect(JSON.parse((llmResponse.content?.parts?.[0] as any).text)).toEqual({
			ok: true,
		});
	});

	it("rethrows original JSON.parse error when jsonrepair also fails", async () => {
		const schema = z.object({ a: z.number() });
		const llmResponse: LlmResponse = {
			content: {
				role: "model",
				parts: [{ text: "definitely-not-json-@@@" }],
			},
		};
		const events = await drain(
			responseProcessor.runAsync(makeCtx(schema), llmResponse),
		);
		expect(events).toHaveLength(1);
		expect(llmResponse.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
		expect(llmResponse.errorMessage).toMatch(/Output schema validation failed/);
	});

	it("String(error) path when non-Error is thrown from schema.parse", async () => {
		const schema = {
			parse: () => {
				throw "boom-string";
			},
		};
		const llmResponse: LlmResponse = {
			content: { role: "model", parts: [{ text: '{"a":1}' }] },
		};
		const events = await drain(
			responseProcessor.runAsync(makeCtx(schema as any), llmResponse),
		);
		expect(events).toHaveLength(1);
		expect(llmResponse.errorMessage).toContain("boom-string");
	});

	it("early-returns when agent has no outputSchema", async () => {
		const llmResponse: LlmResponse = {
			content: { role: "model", parts: [{ text: '{"a":1}' }] },
		};
		const events = await drain(
			responseProcessor.runAsync(
				{
					invocationId: "inv",
					agent: { name: "plain" },
				} as any,
				llmResponse,
			),
		);
		expect(events).toHaveLength(0);
		expect((llmResponse.content?.parts?.[0] as any).text).toBe('{"a":1}');
	});
});
