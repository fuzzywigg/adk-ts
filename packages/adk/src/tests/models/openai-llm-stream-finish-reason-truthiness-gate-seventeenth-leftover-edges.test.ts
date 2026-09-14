import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlmRequest } from "../../models/llm-request";
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
 * Seventeenth leftover: stream `if (choice.finish_reason)` truthiness gate —
 * falsy finish_reason stays on partial/else path; truthy `"0"` finalizes.
 * Distinct from #219 BaseLlm `|| "unknown"` and seventh toAdkFinishReason case.
 */
describe("openai-llm stream finish-reason truthiness gate seventeenth leftover edges", () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		process.env.OPENAI_API_KEY = "test-key";
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	async function streamOut(finishReason: unknown) {
		const create = vi.fn().mockResolvedValue(
			(async function* () {
				yield {
					choices: [
						{
							delta: { content: "hi" },
							finish_reason: finishReason,
							index: 0,
						},
					],
				};
			})(),
		);
		(OpenAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
			chat: { completions: { create } },
		}));
		const llm = new OpenAiLlm("gpt-4o-mini");
		const out: any[] = [];
		for await (const resp of (llm as any).generateContentAsyncImpl(
			new LlmRequest({
				contents: [{ role: "user", parts: [{ text: "q" }] }],
			}),
			true,
		)) {
			out.push(resp);
		}
		return out;
	}

	it.each([
		{ label: "null", finishReason: null },
		{ label: "empty", finishReason: "" },
		{ label: "0", finishReason: 0 },
		{ label: "false", finishReason: false },
	])("falsy finish_reason ($label) stays partial / no ADK finishReason", async ({
		finishReason,
	}) => {
		const out = await streamOut(finishReason);
		expect(out.some((r) => r.partial === true)).toBe(true);
		expect(out.every((r) => r.finishReason == null)).toBe(true);
	});

	it('truthy finish_reason "0" enters final path (UNSPECIFIED)', async () => {
		const out = await streamOut("0");
		const final = out.find((r) => r.finishReason != null);
		expect(final?.finishReason).toBe("FINISH_REASON_UNSPECIFIED");
		expect(final?.content?.parts?.[0]?.text).toBe("hi");
	});

	it('truthy finish_reason "stop" finalizes as STOP', async () => {
		const out = await streamOut("stop");
		expect(out.some((r) => r.finishReason === "STOP")).toBe(true);
	});
});
