import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer";
import type { BaseLlm } from "../../models/base-llm";

describe("LlmEventSummarizer empty text else-if vs whitespace sixth leftover", () => {
	let mockLlm: BaseLlm;

	beforeEach(() => {
		mockLlm = {
			generateContentAsync: vi.fn(),
		} as any;
	});

	async function captureEventsText(event: Event): Promise<string> {
		const summarizer = new LlmEventSummarizer(mockLlm);
		async function* mockGenerator() {
			yield { content: { parts: [{ text: "summary" }] } };
		}
		(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());
		await summarizer.maybeSummarizeEvents([event]);
		return (mockLlm.generateContentAsync as any).mock.calls[0][0].contents[0]
			.parts[0].text as string;
	}

	it("empty text plus functionCall falls through to the tool branch", async () => {
		const event = new Event({
			author: "agent",
			timestamp: 1000,
			content: {
				parts: [
					{
						text: "",
						functionCall: { name: "search", args: { q: "x" } },
					},
				],
			},
		});
		const prompt = await captureEventsText(event);
		expect(prompt).toContain("Called tool 'search'");
		expect(prompt).toContain('"q":"x"');
		expect(prompt).not.toMatch(/agent: $/m);
	});

	it("whitespace text takes the text branch and drops the sibling functionCall", async () => {
		const event = new Event({
			author: "agent",
			timestamp: 1000,
			content: {
				parts: [
					{
						text: " ",
						functionCall: { name: "search", args: { q: "x" } },
					},
				],
			},
		});
		const prompt = await captureEventsText(event);
		expect(prompt).toContain("agent:  ");
		expect(prompt).not.toContain("Called tool");
	});

	it("empty text plus functionResponse uses the response else-if", async () => {
		const event = new Event({
			author: "agent",
			timestamp: 1000,
			content: {
				parts: [
					{
						text: "",
						functionResponse: { name: "search", response: { hits: 1 } },
					},
				],
			},
		});
		const prompt = await captureEventsText(event);
		expect(prompt).toContain("Tool 'search' returned");
		expect(prompt).toContain('"hits":1');
	});
});
