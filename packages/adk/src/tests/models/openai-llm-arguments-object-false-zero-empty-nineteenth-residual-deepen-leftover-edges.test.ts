import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668 (eighteenth
 * parse niche): `JSON.parse(arguments || "{}")` — Object(false)/Object(0)/
 * Object("")/Object(NaN)/"-Infinity"/-1 throw or parse asymmetries.
 */
describe("openai-llm arguments object-false/zero/empty nineteenth residual deepen", () => {
	let llm: OpenAiLlm;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
		llm = new OpenAiLlm("gpt-4o-mini");
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it('string "-Infinity" throws on JSON.parse (both paths)', () => {
		expect(() =>
			(llm as any).createChunkResponse({
				tool_calls: [
					{
						index: 0,
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: "-Infinity" },
					},
				],
			}),
		).toThrow();

		expect(() =>
			(llm as any).openAiMessageToLlmResponse({
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "c1",
							type: "function",
							function: { name: "fn", arguments: "-Infinity" },
						},
					],
				},
				finish_reason: "tool_calls",
			}),
		).toThrow();
	});

	it.each([
		{ label: "Object(false)", arguments: Object(false) as any },
		{ label: "Object(0)", arguments: Object(0) as any },
		{ label: 'Object("")', arguments: Object("") as any },
		{ label: "Object(NaN)", arguments: Object(Number.NaN) as any },
		{ label: "number -1", arguments: -1 as any },
	])("truthy residual $label throws on JSON.parse", ({ arguments: args }) => {
		expect(() =>
			(llm as any).createChunkResponse({
				tool_calls: [
					{
						index: 0,
						id: "c1",
						type: "function",
						function: { name: "fn", arguments: args },
					},
				],
			}),
		).toThrow();

		expect(() =>
			(llm as any).openAiMessageToLlmResponse({
				message: {
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "c1",
							type: "function",
							function: { name: "fn", arguments: args },
						},
					],
				},
				finish_reason: "tool_calls",
			}),
		).toThrow();
	});
});
