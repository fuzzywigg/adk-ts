import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicLlm } from "../../models/anthropic-llm";
import { OpenAiLlm } from "../../models/openai-llm";

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("openai", () => ({
	default: vi.fn(() => ({
		chat: { completions: { create: vi.fn() } },
	})),
}));

vi.mock("@anthropic-ai/sdk", () => ({
	default: vi.fn(() => ({
		messages: { create: vi.fn() },
	})),
}));

/**
 * Seventeenth leftover: Anthropic input_schema keeps only `{type,properties}`
 * — root `required` / extra keys dropped. OpenAI parameters `|| {}` +
 * transform keeps `required`. Distinct from #219 parameters falsy matrix.
 */
describe("anthropic vs openai parameters required dropped seventeenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;
	let openai: OpenAiLlm;
	let anthropic: AnthropicLlm;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		process.env.ANTHROPIC_API_KEY = "test-key";
		openai = new OpenAiLlm("gpt-4o-mini");
		anthropic = new AnthropicLlm();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it("Anthropic drops root required; OpenAI keeps it", () => {
		const decl = {
			name: "search",
			description: "d",
			parameters: {
				type: "OBJECT",
				required: ["q"],
				additionalProperties: false,
				properties: {
					q: { type: "STRING" },
				},
			},
		};

		const anth = (anthropic as any).functionDeclarationToAnthropicTool(decl);
		expect(anth.input_schema).toEqual({
			type: "object",
			properties: { q: { type: "string" } },
		});
		expect(anth.input_schema).not.toHaveProperty("required");
		expect(anth.input_schema).not.toHaveProperty("additionalProperties");

		const oa = (openai as any).functionDeclarationToOpenAiTool(decl);
		expect(oa.function.parameters.required).toEqual(["q"]);
		expect(oa.function.parameters.additionalProperties).toBe(false);
		expect(oa.function.parameters.type).toBe("object");
		expect(oa.function.parameters.properties.q.type).toBe("string");
	});

	it("Anthropic empty properties when parameters missing; OpenAI {}", () => {
		const decl = { name: "noop", description: "" };
		const anth = (anthropic as any).functionDeclarationToAnthropicTool(decl);
		expect(anth.input_schema).toEqual({ type: "object", properties: {} });

		const oa = (openai as any).functionDeclarationToOpenAiTool(decl);
		expect(oa.function.parameters).toEqual({});
	});
});
