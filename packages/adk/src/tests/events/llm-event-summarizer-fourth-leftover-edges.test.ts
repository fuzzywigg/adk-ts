import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event.js";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer.js";
import type { BaseLlm } from "../../models/base-llm.js";

async function* textChunks(
	...chunks: Array<string | undefined | null>
): AsyncGenerator<{ content: { parts: Array<{ text?: any }> } }> {
	for (const chunk of chunks) {
		yield { content: { parts: [{ text: chunk as any }] } };
	}
}

describe("LlmEventSummarizer fourth leftover edges", () => {
	let mockLlm: BaseLlm;

	beforeEach(() => {
		mockLlm = {
			generateContentAsync: vi.fn(),
		} as any;
	});

	describe("nullish / empty event lists", () => {
		const emptyish: Array<{ label: string; events: any }> = [
			{ label: "[]", events: [] },
			{ label: "null", events: null },
			{ label: "undefined", events: undefined },
		];

		for (const row of emptyish) {
			it(`returns undefined without calling model for ${row.label}`, async () => {
				const summarizer = new LlmEventSummarizer(mockLlm);
				expect(
					await summarizer.maybeSummarizeEvents(row.events),
				).toBeUndefined();
				expect(mockLlm.generateContentAsync).not.toHaveBeenCalled();
			});
		}
	});

	describe("author filters in formatted prompt", () => {
		const authors = ["user", "agent", "tool", "system", "", "orchestrator"];

		for (const author of authors) {
			it(`includes author="${author}" in prompt lines`, async () => {
				const summarizer = new LlmEventSummarizer(mockLlm);
				const events = [
					new Event({
						invocationId: "inv",
						author,
						content: { parts: [{ text: `msg-from-${author || "empty"}` }] },
						timestamp: 1_700_000_000,
					}),
				];
				(mockLlm.generateContentAsync as any).mockReturnValue(
					textChunks("summary"),
				);
				await summarizer.maybeSummarizeEvents(events);
				const promptText = (mockLlm.generateContentAsync as any).mock
					.calls[0][0].contents[0].parts[0].text as string;
				expect(promptText).toContain(
					`] ${author}: msg-from-${author || "empty"}`,
				);
			});
		}

		it("formats multiple authors in order", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "i1",
					author: "user",
					content: { parts: [{ text: "q" }] },
					timestamp: 1000,
				}),
				new Event({
					invocationId: "i1",
					author: "agent",
					content: { parts: [{ text: "a" }] },
					timestamp: 1100,
				}),
				new Event({
					invocationId: "i2",
					author: "tool",
					content: {
						parts: [
							{
								functionResponse: {
									name: "search",
									response: { hits: 1 },
								},
							},
						],
					},
					timestamp: 1200,
				}),
			];
			(mockLlm.generateContentAsync as any).mockReturnValue(textChunks("ok"));
			await summarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("user: q");
			expect(promptText).toContain("agent: a");
			expect(promptText).toContain("Tool 'search' returned");
			expect(promptText.indexOf("user: q")).toBeLessThan(
				promptText.indexOf("agent: a"),
			);
		});
	});

	describe("content coalesces in formatEventsForSummarization", () => {
		const contentCases: Array<{
			label: string;
			content: any;
			expectInclude?: string[];
			expectExclude?: string[];
		}> = [
			{
				label: "missing content",
				content: undefined,
				expectExclude: ["user:"],
			},
			{
				label: "empty parts",
				content: { parts: [] },
				expectExclude: ["user:"],
			},
			{
				label: "parts undefined",
				content: { parts: undefined },
				expectExclude: ["user:"],
			},
			{
				label: "empty text skipped",
				content: { parts: [{ text: "" }] },
				expectExclude: ["user:"],
			},
			{
				label: "text present",
				content: { parts: [{ text: "hello" }] },
				expectInclude: ["user: hello"],
			},
			{
				label: "functionCall",
				content: {
					parts: [{ functionCall: { name: "calc", args: { n: 2 } } }],
				},
				expectInclude: ["Called tool 'calc'", '"n":2'],
			},
			{
				label: "functionResponse",
				content: {
					parts: [
						{
							functionResponse: { name: "calc", response: { result: 4 } },
						},
					],
				},
				expectInclude: ["Tool 'calc' returned", '"result":4'],
			},
			{
				label: "inlineData ignored",
				content: {
					parts: [{ inlineData: { data: "abc", mimeType: "image/png" } }],
				},
				expectExclude: ["inlineData", "image/png", "abc"],
			},
			{
				label: "mixed text + call + response + inline",
				content: {
					parts: [
						{ text: "go" },
						{ functionCall: { name: "t", args: {} } },
						{ functionResponse: { name: "t", response: { ok: true } } },
						{ inlineData: { data: "xx" } },
					],
				},
				expectInclude: ["user: go", "Called tool 't'", "Tool 't' returned"],
				expectExclude: ["inlineData"],
			},
		];

		for (const row of contentCases) {
			it(`content coalesce: ${row.label}`, async () => {
				const summarizer = new LlmEventSummarizer(mockLlm);
				const events = [
					new Event({
						invocationId: "inv",
						author: "user",
						content: row.content,
						timestamp: 42,
					}),
				];
				(mockLlm.generateContentAsync as any).mockReturnValue(
					textChunks("sum"),
				);
				await summarizer.maybeSummarizeEvents(events);
				const promptText = (mockLlm.generateContentAsync as any).mock
					.calls[0][0].contents[0].parts[0].text as string;
				for (const s of row.expectInclude ?? []) {
					expect(promptText).toContain(s);
				}
				for (const s of row.expectExclude ?? []) {
					expect(promptText).not.toContain(s);
				}
			});
		}
	});

	describe("model stream coalesces", () => {
		const streamCases: Array<{
			label: string;
			chunks: Array<string | undefined | null>;
			expected: string | undefined;
		}> = [
			{ label: "single chunk", chunks: ["alpha"], expected: "alpha" },
			{
				label: "multi chunk concat",
				chunks: ["a", "b", "c"],
				expected: "abc",
			},
			{
				label: "undefined text coerced via || ''",
				chunks: [undefined, "tail"],
				expected: "tail",
			},
			{
				label: "null text coerced",
				chunks: [null, "z"],
				expected: "z",
			},
			{
				label: "whitespace-only → undefined result",
				chunks: ["  \n\t  "],
				expected: undefined,
			},
			{
				label: "empty string → undefined result",
				chunks: [""],
				expected: undefined,
			},
			{
				label: "trim after concat",
				chunks: ["  hi", "  "],
				expected: "hi",
			},
		];

		for (const row of streamCases) {
			it(`stream: ${row.label}`, async () => {
				const summarizer = new LlmEventSummarizer(mockLlm);
				const events = [
					new Event({
						invocationId: "inv",
						author: "user",
						content: { parts: [{ text: "seed" }] },
						timestamp: 10,
					}),
				];
				(mockLlm.generateContentAsync as any).mockReturnValue(
					textChunks(...row.chunks),
				);
				const result = await summarizer.maybeSummarizeEvents(events);
				if (row.expected === undefined) {
					expect(result).toBeUndefined();
				} else {
					expect(
						result?.actions?.compaction?.compactedContent?.parts?.[0]?.text,
					).toBe(row.expected);
					expect(result?.actions?.compaction?.startTimestamp).toBe(10);
					expect(result?.actions?.compaction?.endTimestamp).toBe(10);
				}
			});
		}

		it("joins multi-part chunk texts with || ''", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv",
					author: "user",
					content: { parts: [{ text: "seed" }] },
					timestamp: 1,
				}),
			];
			async function* gen() {
				yield {
					content: {
						parts: [{ text: "p1" }, { text: undefined }, { text: "p2" }],
					},
				};
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(gen());
			const result = await summarizer.maybeSummarizeEvents(events);
			expect(
				result?.actions?.compaction?.compactedContent?.parts?.[0]?.text,
			).toBe("p1p2");
		});

		it("uses first/last event timestamps for compaction range", async () => {
			const summarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "a",
					author: "user",
					content: { parts: [{ text: "1" }] },
					timestamp: 5,
				}),
				new Event({
					invocationId: "b",
					author: "agent",
					content: { parts: [{ text: "2" }] },
					timestamp: 50,
				}),
			];
			(mockLlm.generateContentAsync as any).mockReturnValue(
				textChunks("range"),
			);
			const result = await summarizer.maybeSummarizeEvents(events);
			expect(result?.actions?.compaction?.startTimestamp).toBe(5);
			expect(result?.actions?.compaction?.endTimestamp).toBe(50);
		});
	});
});
