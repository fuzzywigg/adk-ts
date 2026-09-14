import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event.js";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer.js";
import type { BaseLlm } from "../../models/base-llm.js";

describe("LlmEventSummarizer", () => {
	let mockLlm: BaseLlm;
	let summarizer: LlmEventSummarizer;

	beforeEach(() => {
		mockLlm = {
			generateContentAsync: vi.fn(),
		} as any;

		summarizer = new LlmEventSummarizer(mockLlm);
	});

	describe("maybeSummarizeEvents", () => {
		it("should return undefined for empty events array", async () => {
			const result = await summarizer.maybeSummarizeEvents([]);
			expect(result).toBeUndefined();
		});

		it("should return undefined for null/undefined events", async () => {
			const result = await summarizer.maybeSummarizeEvents(null as any);
			expect(result).toBeUndefined();
		});

		it("should generate summary for valid events", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hello" }] },
					timestamp: 1000,
				}),
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: { parts: [{ text: "Hi there!" }] },
					timestamp: 1100,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "This is a summary of the conversation." }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();
			expect(result?.actions?.compaction).toBeDefined();
			expect(result?.actions?.compaction?.startTimestamp).toBe(1000);
			expect(result?.actions?.compaction?.endTimestamp).toBe(1100);
			expect(result?.actions?.compaction?.compactedContent.parts[0].text).toBe(
				"This is a summary of the conversation.",
			);
		});

		it("should use custom prompt template", async () => {
			const customPrompt =
				"Summarize these events:\n{events}\n\nProvide a bullet-point summary.";
			const customSummarizer = new LlmEventSummarizer(mockLlm, customPrompt);

			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Test message" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "- Event 1: Test message" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await customSummarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();
			expect(mockLlm.generateContentAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					contents: expect.arrayContaining([
						expect.objectContaining({
							parts: expect.arrayContaining([
								expect.objectContaining({
									text: expect.stringContaining("Summarize these events:"),
								}),
							]),
						}),
					]),
				}),
			);
		});

		it("should handle function call events", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{
								functionCall: {
									name: "get_weather",
									args: { city: "San Francisco" },
								},
							},
						],
					},
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "Called weather API for San Francisco" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();
			expect(mockLlm.generateContentAsync).toHaveBeenCalled();

			const callArgs = (mockLlm.generateContentAsync as any).mock.calls[0][0];
			const promptText = callArgs.contents[0].parts[0].text;

			expect(promptText).toContain("get_weather");
			expect(promptText).toContain("San Francisco");
		});

		it("should handle function response events", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "tool",
					content: {
						parts: [
							{
								functionResponse: {
									name: "get_weather",
									response: { temperature: 72, conditions: "sunny" },
								},
							},
						],
					},
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "Weather data retrieved successfully" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();

			const callArgs = (mockLlm.generateContentAsync as any).mock.calls[0][0];
			const promptText = callArgs.contents[0].parts[0].text;

			expect(promptText).toContain("get_weather");
			expect(promptText).toContain("returned");
		});

		it("should concatenate multiple response chunks", async () => {
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
						parts: [{ text: "This is " }],
					},
				};
				yield {
					content: {
						parts: [{ text: "a multi-part " }],
					},
				};
				yield {
					content: {
						parts: [{ text: "summary." }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();
			expect(result?.actions?.compaction?.compactedContent.parts[0].text).toBe(
				"This is a multi-part summary.",
			);
		});

		it("should return undefined when LLM returns empty summary", async () => {
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
						parts: [{ text: "" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeUndefined();
		});

		it("should return undefined when LLM returns whitespace-only summary", async () => {
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
						parts: [{ text: "   \n\t  " }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeUndefined();
		});

		it("should handle events with multiple parts", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{ text: "First part" },
							{
								functionCall: {
									name: "tool",
									args: {},
								},
							},
							{ text: "Second part" },
						],
					},
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "Summary with multiple parts" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();

			const callArgs = (mockLlm.generateContentAsync as any).mock.calls[0][0];
			const promptText = callArgs.contents[0].parts[0].text;

			expect(promptText).toContain("First part");
			expect(promptText).toContain("tool");
			expect(promptText).toContain("Second part");
		});

		it("should format timestamps correctly", async () => {
			const timestamp = 1704067200;
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Test" }] },
					timestamp,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "Summary" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await summarizer.maybeSummarizeEvents(events);

			const callArgs = (mockLlm.generateContentAsync as any).mock.calls[0][0];
			const promptText = callArgs.contents[0].parts[0].text;

			expect(promptText).toContain(
				new Date(timestamp * 1000).toISOString().split("T")[0],
			);
		});

		it("should create compaction event with correct metadata", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Message 1" }] },
					timestamp: 1000,
				}),
				new Event({
					invocationId: "inv-2",
					author: "agent",
					content: { parts: [{ text: "Message 2" }] },
					timestamp: 2000,
				}),
				new Event({
					invocationId: "inv-3",
					author: "user",
					content: { parts: [{ text: "Message 3" }] },
					timestamp: 3000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [{ text: "Compacted summary" }],
					},
				};
			}

			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);

			expect(result).toBeDefined();
			expect(result?.author).toBe("user");
			expect(result?.invocationId).toBeDefined();
			expect(result?.actions?.compaction?.startTimestamp).toBe(1000);
			expect(result?.actions?.compaction?.endTimestamp).toBe(3000);
			expect(result?.actions?.compaction?.compactedContent.role).toBe("model");
		});

		it("uses the default prompt template with {events} placeholder", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Alpha" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "Summary" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await summarizer.maybeSummarizeEvents(events);

			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("helpful assistant tasked with summarizing");
			expect(promptText).toContain("Alpha");
			expect(promptText).not.toContain("{events}");
		});

		it("skips non-text non-tool parts when formatting events", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: {
						parts: [
							{ inlineData: { data: "abc", mimeType: "image/png" } } as any,
							{ text: "" },
							{ text: "visible" },
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
				new Event({
					invocationId: "inv-3",
					author: "agent",
					timestamp: 1200,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "ok" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await summarizer.maybeSummarizeEvents(events);

			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("visible");
			expect(promptText).not.toContain("inlineData");
			expect(promptText).not.toContain("image/png");
		});

		it("tolerates stream chunks with missing content or parts", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hello" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {};
				yield { content: {} };
				yield { content: { parts: undefined } };
				yield { content: { parts: [] } };
				yield { content: { parts: [{ text: undefined }] } };
				yield { content: { parts: [{ text: "final" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);
			const text = result?.actions?.compaction?.compactedContent.parts[0]
				.text as string;
			expect(text.endsWith("final")).toBe(true);
			expect(text).toContain("undefined");
		});

		it("returns undefined when the model yields no chunks", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hello" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				// no yields
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			expect(await summarizer.maybeSummarizeEvents(events)).toBeUndefined();
		});

		it("joins multiple text parts within a single stream chunk", async () => {
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
						parts: [{ text: "part-a" }, { text: "part-b" }, { text: "" }],
					},
				};
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);
			expect(result?.actions?.compaction?.compactedContent.parts[0].text).toBe(
				"part-apart-b",
			);
		});

		it("leaves custom prompts without {events} unchanged and omits event body", async () => {
			const custom = new LlmEventSummarizer(
				mockLlm,
				"Static prompt with no placeholder",
			);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "secret-event-body" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "ok" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await custom.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toBe("Static prompt with no placeholder");
			expect(promptText).not.toContain("secret-event-body");
		});

		it("formats functionCall without args and functionResponse without response", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{ functionCall: { name: "noop" } as any },
							{ functionResponse: { name: "noop" } as any },
						],
					},
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "done" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await summarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("Called tool 'noop' with args undefined");
			expect(promptText).toContain("Tool 'noop' returned: undefined");
		});

		it("joins multi-text parts in one chunk alongside empty and non-text parts across chunks", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "seed" }] },
					timestamp: 1000,
				}),
			];

			async function* mockGenerator() {
				yield {
					content: {
						parts: [
							{ text: "A" },
							{ inlineData: { data: "x", mimeType: "text/plain" } } as any,
							{ text: "B" },
							{ text: undefined as any },
							{ text: "C" },
						],
					},
				};
				yield {
					content: {
						parts: [{ text: "-D" }, { text: "-E" }],
					},
				};
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			const result = await summarizer.maybeSummarizeEvents(events);
			expect(result?.actions?.compaction?.compactedContent.parts[0].text).toBe(
				"ABC-D-E",
			);
		});

		it("does not substitute when custom prompt lacks exact {events} token", async () => {
			const custom = new LlmEventSummarizer(
				mockLlm,
				"Use {EVENTS} and {event_list} only; no lowercase events token.",
			);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "must-not-leak" }] },
					timestamp: 42,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "summary" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await custom.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toBe(
				"Use {EVENTS} and {event_list} only; no lowercase events token.",
			);
			expect(promptText).toContain("{EVENTS}");
			expect(promptText).toContain("{event_list}");
			expect(promptText).not.toContain("must-not-leak");
			expect(promptText).not.toContain("user:");
		});

		it("substitutes only the first {events} occurrence even inside doubled braces", async () => {
			const custom = new LlmEventSummarizer(
				mockLlm,
				"Wrap {{events}} then leave a second {events} alone.",
			);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "payload-x" }] },
					timestamp: 42,
				}),
			];

			async function* mockGenerator() {
				yield { content: { parts: [{ text: "summary" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());

			await custom.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText.startsWith("Wrap {")).toBe(true);
			expect(promptText).toContain("payload-x");
			expect(promptText).toContain("then leave a second {events} alone.");
			expect(promptText.match(/\{events\}/g)).toEqual(["{events}"]);
		});

		it("stringifies omitted functionCall.args as undefined while empty args become {}", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{ functionCall: { name: "no_args" } as any },
							{
								functionCall: {
									name: "explicit_undefined",
									args: undefined,
								} as any,
							},
							{ functionCall: { name: "empty_args", args: {} } },
						],
					},
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
			expect(promptText).toContain("Called tool 'no_args' with args undefined");
			expect(promptText).toContain(
				"Called tool 'explicit_undefined' with args undefined",
			);
			expect(promptText).toContain("Called tool 'empty_args' with args {}");
		});
	});

	describe("leftover edges", () => {
		it("returns undefined when model output is whitespace only", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hello" }] },
					timestamp: 1000,
				}),
			];
			async function* mockGenerator() {
				yield { content: { parts: [{ text: "   \n\t  " }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());
			expect(await summarizer.maybeSummarizeEvents(events)).toBeUndefined();
		});

		it("compaction events use author user and unique invocationId", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hi" }] },
					timestamp: 1000,
				}),
			];
			async function* mockGenerator() {
				yield { content: { parts: [{ text: "Summary text" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());
			const result = await summarizer.maybeSummarizeEvents(events);
			expect(result?.author).toBe("user");
			expect(result?.invocationId).toMatch(/^[a-f0-9]{8}$/);
			expect(result?.invocationId).not.toBe("inv-1");
		});

		it("uses identical start and end timestamps for single-event compaction", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "solo" }] },
					timestamp: 4242,
				}),
			];
			async function* mockGenerator() {
				yield { content: { parts: [{ text: "done" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());
			const result = await summarizer.maybeSummarizeEvents(events);
			expect(result?.actions?.compaction?.startTimestamp).toBe(4242);
			expect(result?.actions?.compaction?.endTimestamp).toBe(4242);
		});

		it("formats functionResponse payloads with JSON.stringify", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "tool",
					content: {
						parts: [
							{
								functionResponse: {
									name: "calc",
									response: { sum: 3, nested: { ok: true } },
								},
							},
						],
					},
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
			expect(promptText).toContain('"sum":3');
			expect(promptText).toContain("Tool 'calc' returned:");
		});

		it("includes multiple authors in formatted event text", async () => {
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "question" }] },
					timestamp: 1000,
				}),
				new Event({
					invocationId: "inv-2",
					author: "agent",
					content: { parts: [{ text: "answer" }] },
					timestamp: 1100,
				}),
			];
			async function* mockGenerator() {
				yield { content: { parts: [{ text: "summary" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());
			await summarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("user: question");
			expect(promptText).toContain("agent: answer");
		});

		it("uses the default summarization prompt when none is provided", async () => {
			const defaultSummarizer = new LlmEventSummarizer(mockLlm);
			const events = [
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "ping" }] },
					timestamp: 1000,
				}),
			];
			async function* mockGenerator() {
				yield { content: { parts: [{ text: "pong" }] } };
			}
			(mockLlm.generateContentAsync as any).mockReturnValue(mockGenerator());
			await defaultSummarizer.maybeSummarizeEvents(events);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("helpful assistant tasked with summarizing");
			expect(promptText).toContain("user: ping");
		});
	});
});
