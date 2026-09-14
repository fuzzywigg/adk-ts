import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

describe("OpenAiLlm sixth leftover: transformSchema array-root (post #151)", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: {
				completions: {
					create: vi.fn(),
				},
			},
		}));
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("maps array root of object schemas, lowercasing nested TYPE", () => {
		const result = (llm as any).transformSchemaForOpenAi([
			{
				type: "OBJECT",
				properties: {
					name: { type: "STRING" },
					count: { type: "INTEGER" },
				},
			},
			{
				type: "ARRAY",
				items: { type: "NUMBER" },
			},
		]);

		expect(result).toEqual([
			{
				type: "object",
				properties: {
					name: { type: "string" },
					count: { type: "integer" },
				},
			},
			{
				type: "array",
				items: { type: "number" },
			},
		]);
	});

	it("recursively transforms nested properties/items/anyOf inside array root", () => {
		const result = (llm as any).transformSchemaForOpenAi([
			{
				type: "OBJECT",
				properties: {
					nested: {
						type: "OBJECT",
						properties: {
							tag: { type: "STRING" },
						},
					},
					list: {
						type: "ARRAY",
						items: { type: "BOOLEAN" },
					},
					choice: {
						anyOf: [{ type: "STRING" }, { type: "NULL" }],
					},
				},
			},
		]);

		expect(result[0].type).toBe("object");
		expect(result[0].properties.nested.type).toBe("object");
		expect(result[0].properties.nested.properties.tag.type).toBe("string");
		expect(result[0].properties.list.type).toBe("array");
		expect(result[0].properties.list.items.type).toBe("boolean");
		expect(result[0].properties.choice.anyOf).toEqual([
			{ type: "string" },
			{ type: "null" },
		]);
	});

	it("oneOf/allOf arrays inside array-root schemas are transformed", () => {
		const result = (llm as any).transformSchemaForOpenAi([
			{
				oneOf: [{ type: "STRING" }, { type: "INTEGER" }],
			},
			{
				allOf: [
					{ type: "OBJECT", properties: { a: { type: "NUMBER" } } },
					{ type: "OBJECT", properties: { b: { type: "BOOLEAN" } } },
				],
			},
		]);

		expect(result[0].oneOf).toEqual([{ type: "string" }, { type: "integer" }]);
		expect(result[1].allOf[0].type).toBe("object");
		expect(result[1].allOf[0].properties.a.type).toBe("number");
		expect(result[1].allOf[1].properties.b.type).toBe("boolean");
	});

	it("functionDeclarationToOpenAiTool uses array-root parameter transform", () => {
		const tool = (llm as any).functionDeclarationToOpenAiTool({
			name: "multi_schema",
			description: "uses array params",
			parameters: [{ type: "OBJECT", properties: { q: { type: "STRING" } } }],
		});

		expect(tool).toEqual({
			type: "function",
			function: {
				name: "multi_schema",
				description: "uses array params",
				parameters: [
					{
						type: "object",
						properties: { q: { type: "string" } },
					},
				],
			},
		});
	});
});
