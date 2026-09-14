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

describe("OpenAiLlm sixth leftover: content multi-tool .find (post #151)", () => {
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

	it("contentToOpenAiMessage keeps only the first of two functionCall parts", () => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						id: "fc-1",
						name: "first_tool",
						args: { a: 1 },
					},
				},
				{
					functionCall: {
						id: "fc-2",
						name: "second_tool",
						args: { b: 2 },
					},
				},
			],
		});

		expect(msg.role).toBe("assistant");
		expect(msg.tool_calls).toHaveLength(1);
		expect(msg.tool_calls[0]).toMatchObject({
			id: "fc-1",
			type: "function",
			function: {
				name: "first_tool",
				arguments: JSON.stringify({ a: 1 }),
			},
		});
	});

	it("contentToOpenAiMessage keeps only the first of two functionResponse parts", () => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [
				{
					functionResponse: {
						id: "fr-1",
						name: "first_tool",
						response: { ok: true },
					},
				},
				{
					functionResponse: {
						id: "fr-2",
						name: "second_tool",
						response: { ok: false },
					},
				},
			],
		});

		expect(msg).toEqual({
			role: "tool",
			tool_call_id: "fr-1",
			content: JSON.stringify({ ok: true }),
		});
	});

	it("functionCall branch wins over later text parts (find first FC only)", () => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{ text: "ignored-because-fc-present" },
				{
					functionCall: {
						id: "fc-win",
						name: "winner",
						args: {},
					},
				},
				{
					functionCall: {
						id: "fc-lose",
						name: "loser",
						args: { x: 1 },
					},
				},
			],
		});

		expect(msg.tool_calls).toHaveLength(1);
		expect(msg.tool_calls[0].id).toBe("fc-win");
		expect(msg.content).toBeUndefined();
	});

	it("functionResponse branch wins over later text when FR present", () => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "user",
			parts: [
				{ text: "ignored-because-fr-present" },
				{
					functionResponse: {
						id: "fr-win",
						name: "tool",
						response: { v: 1 },
					},
				},
				{
					functionResponse: {
						id: "fr-lose",
						name: "other",
						response: { v: 2 },
					},
				},
			],
		});

		expect(msg).toEqual({
			role: "tool",
			tool_call_id: "fr-win",
			content: JSON.stringify({ v: 1 }),
		});
	});

	it("empty functionCall id coalesces to empty string", () => {
		const msg = (llm as any).contentToOpenAiMessage({
			role: "model",
			parts: [
				{
					functionCall: {
						name: "no_id",
						args: null,
					},
				},
			],
		});

		expect(msg.tool_calls[0].id).toBe("");
		expect(msg.tool_calls[0].function.arguments).toBe("{}");
	});
});
