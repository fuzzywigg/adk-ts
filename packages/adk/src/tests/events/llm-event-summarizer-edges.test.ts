import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event.js";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer.js";
import type { BaseLlm } from "../../models/base-llm.js";

describe("LlmEventSummarizer edges", () => {
	let mockLlm: BaseLlm;

	beforeEach(() => {
		mockLlm = {
			generateContentAsync: vi.fn(),
		} as any;
	});

	describe("prompt || DEFAULT", () => {
		it("uses default summarization prompt when prompt is omitted", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "ping" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "summary" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await summarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("helpful assistant tasked with summarizing");
			expect(promptText).toContain("user: ping");
			expect(promptText).not.toContain("{events}");
		});

		it("uses custom prompt when provided", async () => {
			const customPrompt = "Summarize:\n{events}";
			const summarizer = new LlmEventSummarizer(mockLlm, customPrompt);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "alpha" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "ok" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await summarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("Summarize:");
			expect(promptText).toContain("alpha");
		});
	});

	describe("part.text || ''", () => {
		it("coerces undefined text parts to empty strings in stream aggregation", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "seed" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: undefined }] } };
				yield { content: { parts: [{ text: "tail" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);
			expect(
				result?.actions?.compaction?.compactedContent?.parts?.[0]?.text,
			).toBe("tail");
		});

		it("joins multiple text parts within a single chunk using || ''", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hello" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [
							{ text: "part-a" },
							{ text: undefined },
							{ text: "part-b" },
						],
					},
				};
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);
			expect(
				result?.actions?.compaction?.compactedContent?.parts?.[0]?.text,
			).toBe("part-apart-b");
		});
	});

	describe("non-text only events → empty prompt body", () => {
		it("still calls model but formats empty event text for non-text-only parts", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{ inlineData: { data: "abc", mimeType: "image/png" } } as any,
							{ text: "" },
						],
					},
					timestamp: 1000,
				}),
				new Event({
					invocationId: "inv-2",
					author: "agent",
					content: { parts: [] },
					timestamp: 1100,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "summary-ok" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).not.toContain("inlineData");
			expect(promptText).not.toContain("image/png");
			expect(
				result?.actions?.compaction?.compactedContent?.parts?.[0]?.text,
			).toBe("summary-ok");
		});

		it("returns undefined when model yields whitespace-only summary for non-text events", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: { parts: [{ inlineData: { data: "x" } } as any] },
					timestamp: 1,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "   \n\t  " }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			expect(await summarizer.maybeSummarizeEvents(events)).toBeUndefined();
		});
	});

	describe("empty event list guard", () => {
		it.each([
			[],
			null,
			undefined,
		])("returns undefined without calling model for %s", async (events) => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			expect(
				await summarizer.maybeSummarizeEvents(events as any),
			).toBeUndefined();
			expect(mockLlm.generateContentAsync).not.toHaveBeenCalled();
		});
	});
});
