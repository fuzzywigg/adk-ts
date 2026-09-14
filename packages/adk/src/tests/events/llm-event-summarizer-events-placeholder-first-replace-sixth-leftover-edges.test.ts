import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer";
import type { BaseLlm } from "../../models/base-llm";

/**
 * Sixth leftover: maybeSummarizeEvents uses String.replace("{events}", ...)
 * without /g, so only the first placeholder is substituted.
 */
describe("llm-event-summarizer {events} first-replace sixth leftover edges", () => {
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

	it("replaces only the first {events} placeholder", async () => {
		const summarizer = new LlmEventSummarizer(
			mockLlm,
			"HEAD {events} MID {events} TAIL",
		);
		(mockLlm.generateContentAsync as any).mockReturnValue(
			textChunks("summary"),
		);
		await summarizer.maybeSummarizeEvents([
			new Event({
				invocationId: "inv",
				author: "user",
				content: { parts: [{ text: "ping" }] },
				timestamp: 1_700_000_000,
			}),
		]);
		const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
			.contents[0].parts[0].text as string;
		expect(promptText).toContain("HEAD ");
		expect(promptText).toContain("user: ping");
		expect(promptText).toContain(" MID {events} TAIL");
		expect(promptText.match(/\{events\}/g)).toEqual(["{events}"]);
	});

	it("leaves a prompt without {events} unchanged aside from the request wrap", async () => {
		const summarizer = new LlmEventSummarizer(mockLlm, "no-placeholder");
		(mockLlm.generateContentAsync as any).mockReturnValue(textChunks("s"));
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
		expect(promptText).toBe("no-placeholder");
	});
});
