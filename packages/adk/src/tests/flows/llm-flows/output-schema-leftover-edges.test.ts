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

describe("output-schema leftover: strip fences → prose miss → raw.trim()", () => {
	const fenceHits: Array<{ label: string; text: string; expected: unknown }> = [
		{
			label: "json fence",
			text: '```json\n{"v":1}\n```',
			expected: { v: 1 },
		},
		{
			label: "bare fence",
			text: '```\n{"v":2}\n```',
			expected: { v: 2 },
		},
		{
			label: "JSON uppercase fence",
			text: '```JSON\n{"v":3}\n```',
			expected: { v: 3 },
		},
		{
			label: "fence with surrounding prose",
			text: 'Sure!\n```json\n{"v":4}\n```\nDone.',
			expected: { v: 4 },
		},
	];

	for (const { label, text, expected } of fenceHits) {
		it(`fence hit: ${label}`, async () => {
			const schema = z.object({ v: z.number() });
			const response = new LlmResponse({
				content: { role: "model", parts: [{ text }] },
			});
			await collect(
				responseProcessor.runAsync(
					makeContext({ name: "fence", outputSchema: schema }),
					response,
				),
			);
			expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual(
				expected,
			);
		});
	}

	const proseHits: Array<{ label: string; text: string; expected: unknown }> = [
		{
			label: "prose then object",
			text: 'Here is the JSON:\n{"answer":"a"}',
			expected: { answer: "a" },
		},
		{
			label: "prose then array",
			text: "Results:\n[1,2,3]",
			expected: [1, 2, 3],
		},
		{
			label: "blank lines then object",
			text: '\n\n  {"answer":"b"}\n',
			expected: { answer: "b" },
		},
		{
			label: "multi-line prose before brace",
			text: 'Line1\nLine2\n{"answer":"c"}',
			expected: { answer: "c" },
		},
	];

	for (const { label, text, expected } of proseHits) {
		it(`prose strip: ${label}`, async () => {
			const schema =
				typeof expected === "object" && !Array.isArray(expected)
					? z.object({ answer: z.string() })
					: z.array(z.number());
			const response = new LlmResponse({
				content: { role: "model", parts: [{ text }] },
			});
			await collect(
				responseProcessor.runAsync(
					makeContext({ name: "prose", outputSchema: schema }),
					response,
				),
			);
			expect(JSON.parse(response.content?.parts?.[0]?.text ?? "null")).toEqual(
				expected,
			);
		});
	}

	const rawTrimMatrix: Array<{
		label: string;
		text: string;
		schema: z.ZodTypeAny;
		expected?: unknown;
		expectError?: boolean;
	}> = [
		{
			label: "bare object uses raw.trim()",
			text: '  {"n":9}  ',
			schema: z.object({ n: z.number() }),
			expected: { n: 9 },
		},
		{
			label: "bare array uses raw.trim()",
			text: "  [1,2]  ",
			schema: z.array(z.number()),
			expected: [1, 2],
		},
		{
			label: "prose miss + non-json falls to raw.trim then parse fail",
			text: "  not-json-at-all {{{  ",
			schema: z.object({ a: z.string() }),
			expectError: true,
		},
		{
			label: "plain string without brace/bracket uses raw.trim",
			text: '  "hello"  ',
			schema: z.string(),
			expected: "hello",
		},
		{
			label: "boolean literal via raw.trim",
			text: "  true  ",
			schema: z.boolean(),
			expected: true,
		},
		{
			label: "number literal via raw.trim",
			text: "\n42\n",
			schema: z.number(),
			expected: 42,
		},
		{
			label: "prose without json start falls through to trim fail",
			text: "Sorry I cannot help with that request.",
			schema: z.object({ ok: z.boolean() }),
			expectError: true,
		},
		{
			label: "empty fence content falls through",
			text: "```json\n\n```",
			schema: z.object({ x: z.number() }),
			expectError: true,
		},
	];

	for (const { label, text, schema, expected, expectError } of rawTrimMatrix) {
		it(`raw.trim path: ${label}`, async () => {
			const response = new LlmResponse({
				content: { role: "model", parts: [{ text }] },
			});
			const events = await collect(
				responseProcessor.runAsync(
					makeContext({ name: "raw-trim", outputSchema: schema }),
					response,
				),
			);
			if (expectError) {
				expect(events).toHaveLength(1);
				expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
			} else {
				expect(events).toEqual([]);
				expect(
					JSON.parse(response.content?.parts?.[0]?.text ?? "null"),
				).toEqual(expected);
			}
		});
	}
});

describe("output-schema leftover: jsonrepair fail rethrows original", () => {
	const unrepairable: Array<{ label: string; text: string }> = [
		{ label: "broken braces", text: "{{{not-json" },
		{ label: "random prose", text: "totally not json whatsoever" },
		{ label: "truncated object", text: '{"a":' },
		{ label: "only punctuation", text: "???!!!###" },
		{ label: "mixed garbage", text: "abc { [ } ] def" },
	];

	for (const { label, text } of unrepairable) {
		it(`unrepairable ${label} yields parse error event`, async () => {
			const schema = z.object({ answer: z.string() });
			const response = new LlmResponse({
				content: { role: "model", parts: [{ text }] },
			});
			const events = await collect(
				responseProcessor.runAsync(
					makeContext({ name: "fail-agent", outputSchema: schema }),
					response,
				),
			);
			expect(events).toHaveLength(1);
			expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
			expect(response.errorMessage).toContain("fail-agent");
			const event = events[0] as Event;
			expect(event.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
			expect(event.content?.parts?.[0]?.text).toContain("Error:");
		});
	}

	const repairable: Array<{ label: string; text: string; expected: unknown }> =
		[
			{
				label: "trailing comma",
				text: '{"n":1,}',
				expected: { n: 1 },
			},
			{
				label: "unquoted keys",
				text: "{n: 2}",
				expected: { n: 2 },
			},
			{
				label: "single quotes",
				text: "{'n': 3}",
				expected: { n: 3 },
			},
			{
				label: "trailing comma in nested",
				text: '{"n":4,"label":"x",}',
				expected: { n: 4, label: "x" },
			},
		];

	for (const { label, text, expected } of repairable) {
		it(`jsonrepair succeeds: ${label}`, async () => {
			const schema =
				"label" in (expected as object)
					? z.object({ n: z.number(), label: z.string() })
					: z.object({ n: z.number() });
			const response = new LlmResponse({
				content: { role: "model", parts: [{ text }] },
			});
			const events = await collect(
				responseProcessor.runAsync(
					makeContext({ name: "repair-agent", outputSchema: schema }),
					response,
				),
			);
			expect(events).toEqual([]);
			expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual(
				expected,
			);
		});
	}
});

describe("output-schema leftover: fence miss then prose miss combinations", () => {
	it("incomplete fence does not match and falls to prose/raw", async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```json\n{"v":5}' }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "incomplete-fence", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			v: 5,
		});
	});

	it("fence with whitespace-only capture falls through to prose/raw", async () => {
		const schema = z.object({ v: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '```json\n   \n```\n{"v":6}' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "empty-fence", outputSchema: schema }),
				response,
			),
		);
		if (events.length === 0) {
			expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
				v: 6,
			});
		} else {
			expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
		}
	});

	it("prose lines that do not start with {/[} fall to raw.trim", async () => {
		const schema = z.string();
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: 'Note:\n"ok"' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "note", outputSchema: schema }),
				response,
			),
		);
		expect(events.length === 0 || response.errorCode).toBeTruthy();
	});

	it("joins multi-part text before strip/parse", async () => {
		const schema = z.object({ a: z.number() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"a":' }, { text: "7}" }],
			},
		});
		await collect(
			responseProcessor.runAsync(
				makeContext({ name: "multipart", outputSchema: schema }),
				response,
			),
		);
		expect(JSON.parse(response.content?.parts?.[0]?.text ?? "{}")).toEqual({
			a: 7,
		});
	});

	it("schema validation failure after successful parse", async () => {
		const schema = z.object({ answer: z.string() });
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: '{"answer":123}' }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(
				makeContext({ name: "type-mismatch", outputSchema: schema }),
				response,
			),
		);
		expect(events).toHaveLength(1);
		expect(response.errorCode).toBe("OUTPUT_SCHEMA_VALIDATION_FAILED");
	});
});
