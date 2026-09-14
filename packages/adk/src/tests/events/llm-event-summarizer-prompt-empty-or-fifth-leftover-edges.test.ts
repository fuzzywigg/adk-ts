import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer";
import type { BaseLlm } from "../../models/base-llm";

describe("LlmEventSummarizer prompt empty || DEFAULT fifth leftover (post #165)", () => {
	let mockLlm: BaseLlm;

	beforeEach(() => {
		mockLlm = {
			generateContentAsync: vi.fn(),
		} as any;
	});

	async function* textChunks(...chunks: string[]) {
		for (const chunk of chunks) {
			yield { content: { parts: [{ text: chunk }] } };
		}
	}

	it.each([
		{ label: '""', prompt: "" },
		{ label: "null", prompt: null },
		{ label: "undefined", prompt: undefined },
	] as const)("falsy prompt $label falls through || to DEFAULT summarization prompt", async ({
		prompt,
	}) => {
		const summarizer = new LlmEventSummarizer(mockLlm, prompt as any);
		(mockLlm.generateContentAsync as any).mockReturnValue(
			textChunks("summary"),
		);
		await summarizer.maybeSummarizeEvents([
			new Event({
				invocationId: "inv",
				author: "user",
				content: { parts: [{ text: "ping" }] },
				timestamp: 1000,
			}),
		]);
		const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
			.contents[0].parts[0].text as string;
		expect(promptText).toContain("helpful assistant tasked with summarizing");
		expect(promptText).toContain("user: ping");
		expect(promptText).not.toContain("{events}");
	});

	it('whitespace-only custom prompt is truthy so || keeps it (asymmetry vs "")', async () => {
		const summarizer = new LlmEventSummarizer(mockLlm, "   {events}   ");
		(mockLlm.generateContentAsync as any).mockReturnValue(textChunks("ok"));
		await summarizer.maybeSummarizeEvents([
			new Event({
				invocationId: "inv",
				author: "user",
				content: { parts: [{ text: "x" }] },
				timestamp: 1,
			}),
		]);
		const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
			.contents[0].parts[0].text as string;
		expect(promptText).toBe("   x   ");
		expect(promptText).not.toContain("helpful assistant");
	});

	it.each([
		{
			label: "all empty/undefined texts",
			chunks: ["", undefined, null],
			expectUndef: true,
		},
		{
			label: "whitespace-only summary",
			chunks: ["  \n\t  "],
			expectUndef: true,
		},
		{
			label: "mixed empty then content",
			chunks: ["", "keep"],
			expectUndef: false,
		},
	] as const)("trim-empty summary returns undefined: $label", async ({
		chunks,
		expectUndef,
	}) => {
		const summarizer = new LlmEventSummarizer(mockLlm);
		(mockLlm.generateContentAsync as any).mockReturnValue(
			(async function* () {
				for (const chunk of chunks) {
					yield { content: { parts: [{ text: chunk as any }] } };
				}
			})(),
		);
		const result = await summarizer.maybeSummarizeEvents([
			new Event({
				invocationId: "inv",
				author: "user",
				content: { parts: [{ text: "seed" }] },
				timestamp: 1,
			}),
		]);
		if (expectUndef) {
			expect(result).toBeUndefined();
		} else {
			expect(
				result?.actions?.compaction?.compactedContent?.parts?.[0]?.text,
			).toBe("keep");
		}
	});

	it("formatEventsForSummarization skips non-text/non-tool parts via part.text truthiness", async () => {
		const summarizer = new LlmEventSummarizer(mockLlm);
		(mockLlm.generateContentAsync as any).mockReturnValue(textChunks("s"));
		await summarizer.maybeSummarizeEvents([
			new Event({
				invocationId: "inv",
				author: "agent",
				content: {
					parts: [
						{ text: "" },
						{ inlineData: { data: "x", mimeType: "image/png" } } as any,
						{ text: "visible" },
						{
							functionCall: { name: "search", args: { q: 1 } },
						} as any,
					],
				},
				timestamp: 1_700_000_000,
			}),
		]);
		const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
			.contents[0].parts[0].text as string;
		expect(promptText).toContain("agent: visible");
		expect(promptText).toContain("Called tool 'search'");
		expect(promptText).not.toMatch(/agent: \n/);
	});
});
