import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event.js";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer.js";
import type { BaseLlm } from "../../models/base-llm.js";

describe("LlmEventSummarizer prompt || DEFAULT fifth leftover", () => {
	let mockLlm: BaseLlm;

	beforeEach(() => {
		mockLlm = {
			generateContentAsync: vi.fn(),
		} as any;
	});

	async function runWithPrompt(prompt?: string | null | false | 0) {
		const summarizer =
			prompt === undefined
				? new LlmEventSummarizer(mockLlm)
				: new LlmEventSummarizer(mockLlm, prompt as any);
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
		return (mockLlm.generateContentAsync as any).mock.calls[0][0].contents[0]
			.parts[0].text as string;
	}

	it.each([
		{ label: "empty-string", prompt: "" as const },
		{ label: "null", prompt: null },
		{ label: "false", prompt: false as const },
		{ label: "0", prompt: 0 as const },
	])("$label prompt coalesces to DEFAULT via ||", async ({ prompt }) => {
		const promptText = await runWithPrompt(prompt);
		expect(promptText).toContain("helpful assistant tasked with summarizing");
		expect(promptText).toContain("user: ping");
		expect(promptText).not.toContain("{events}");
	});

	it("omitted prompt uses DEFAULT", async () => {
		const promptText = await runWithPrompt(undefined);
		expect(promptText).toContain("helpful assistant tasked with summarizing");
	});

	it("whitespace-only custom prompt is truthy and kept", async () => {
		const promptText = await runWithPrompt("   {events}   ");
		expect(promptText).toContain("ping");
		expect(promptText).not.toContain(
			"helpful assistant tasked with summarizing",
		);
		expect(promptText.trim().startsWith("[")).toBe(true);
	});

	it("custom prompt without {events} placeholder never injects events", async () => {
		const promptText = await runWithPrompt("Static only");
		expect(promptText).toBe("Static only");
		expect(promptText).not.toContain("ping");
	});
});
