import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("@anthropic-ai/sdk");

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: {
			completions: {
				create: vi.fn(),
			},
		},
	})),
}));

describe("AnthropicLlm type-coercion sixth leftover edges (post #150)", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let llm: AnthropicLlm;
	let openai: OpenAiLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.ANTHROPIC_API_KEY = "test-key";
		process.env.OPENAI_API_KEY = "test-key";
		(Anthropic as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			() => ({
				messages: { create: vi.fn() },
			}),
		);
		llm = new AnthropicLlm();
		openai = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it.each([
		{ label: "number", type: 42 },
		{ label: "boolean", type: true },
		{ label: "null", type: null },
	])("updateTypeString throws TypeError when top-level type is $label", ({
		type,
	}) => {
		expect(() => (llm as any).updateTypeString({ type })).toThrow(TypeError);
	});

	it("updateTypeString throws on nested items.type that is non-string", () => {
		expect(() =>
			(llm as any).updateTypeString({
				type: "ARRAY",
				items: { type: 7 },
			}),
		).toThrow(TypeError);
	});

	it("updateTypeString throws on nested items.properties value with non-string type", () => {
		expect(() =>
			(llm as any).updateTypeString({
				type: "ARRAY",
				items: {
					type: "OBJECT",
					properties: {
						flag: { type: false },
					},
				},
			}),
		).toThrow(TypeError);
	});

	it("OpenAI transformSchemaForOpenAi leaves the same non-string types unchanged", () => {
		const schema = {
			type: 42,
			items: {
				type: true,
				properties: {
					flag: { type: null },
				},
			},
		};
		const transformed = (openai as any).transformSchemaForOpenAi(schema);
		expect(transformed.type).toBe(42);
		expect(transformed.items.type).toBe(true);
		expect(transformed.items.properties.flag.type).toBe(null);
	});

	it("updateTypeString still lowercases string types before hitting nested non-string throw", () => {
		const schema = {
			type: "OBJECT",
			items: {
				type: "ARRAY",
				properties: {
					ok: { type: "STRING" },
					bad: { type: 99 },
				},
			},
		};

		expect(() => (llm as any).updateTypeString(schema)).toThrow(TypeError);
		expect(schema.type).toBe("object");
		expect(schema.items.type).toBe("array");
		expect(schema.items.properties.ok.type).toBe("string");
		expect(schema.items.properties.bad.type).toBe(99);
	});
});
