import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event } from "../../events/event";
import { EventActions } from "../../events/event-actions";
import { LlmEventSummarizer } from "../../events/llm-event-summarizer.js";
import type { BaseLlm } from "../../models/base-llm.js";

describe("Event + EventActions + LlmEventSummarizer heavy matrix edges", () => {
	describe("Event finality matrices", () => {
		it.each([
			{
				name: "plain text",
				opts: { author: "agent", content: { parts: [{ text: "done" }] } },
				final: true,
			},
			{
				name: "partial stream",
				opts: {
					author: "agent",
					partial: true,
					content: { parts: [{ text: "streaming" }] },
				},
				final: false,
			},
			{
				name: "function call",
				opts: {
					author: "agent",
					content: {
						parts: [{ functionCall: { name: "tool", args: {} } }],
					},
				},
				final: false,
			},
			{
				name: "function response",
				opts: {
					author: "tool",
					content: {
						parts: [
							{ functionResponse: { name: "search", response: { ok: true } } },
						],
					},
				},
				final: false,
			},
			{
				name: "skipSummarization",
				opts: {
					author: "agent",
					actions: new EventActions({ skipSummarization: true }),
					content: {
						parts: [{ functionCall: { name: "wait", args: {} } }],
					},
				},
				final: true,
			},
			{
				name: "longRunningToolIds set",
				opts: {
					author: "agent",
					longRunningToolIds: new Set(["1"]),
					content: {
						parts: [{ functionCall: { name: "wait", args: {} } }],
					},
				},
				final: true,
			},
			{
				name: "empty longRunningToolIds set",
				opts: {
					author: "agent",
					longRunningToolIds: new Set(),
					content: {
						parts: [{ functionCall: { name: "pending", args: {} } }],
					},
				},
				final: true,
			},
			{
				name: "trailing code execution",
				opts: {
					author: "agent",
					content: {
						parts: [{ text: "ran" }, { codeExecutionResult: { output: "1" } }],
					},
				},
				final: false,
			},
			{
				name: "empty content object",
				opts: { author: "agent", content: {} },
				final: true,
			},
			{
				name: "empty parts with partial",
				opts: {
					author: "agent",
					partial: true,
					content: { parts: [] },
				},
				final: false,
			},
		])("isFinalResponse: $name → $final", ({ opts, final }) => {
			expect(new Event(opts as any).isFinalResponse()).toBe(final);
		});

		it("short-circuits skipSummarization ahead of partial and calls", () => {
			expect(
				new Event({
					author: "agent",
					partial: true,
					actions: new EventActions({ skipSummarization: true }),
					content: {
						parts: [{ functionCall: { name: "x", args: {} } }],
					},
				}).isFinalResponse(),
			).toBe(true);
		});

		it("collects multiple function calls and responses in order", () => {
			const event = new Event({
				author: "agent",
				content: {
					parts: [
						{ text: "intro" },
						{ functionCall: { name: "a", args: { n: 1 } } },
						{ functionCall: { name: "b", args: { n: 2 } } },
						{ functionResponse: { name: "a", response: 1 } },
						{ functionResponse: { name: "b", response: 2 } },
					],
				},
			});
			expect(event.getFunctionCalls()).toEqual([
				{ name: "a", args: { n: 1 } },
				{ name: "b", args: { n: 2 } },
			]);
			expect(event.getFunctionResponses()).toEqual([
				{ name: "a", response: 1 },
				{ name: "b", response: 2 },
			]);
		});

		it("returns empty call lists for missing or non-array parts", () => {
			expect(new Event({ author: "a" }).getFunctionCalls()).toEqual([]);
			expect(
				new Event({
					author: "a",
					content: { parts: "not-an-array" as any },
				}).getFunctionCalls(),
			).toEqual([]);
		});

		it("hasTrailingCodeExecutionResult only for trailing code result", () => {
			expect(new Event({ author: "a" }).hasTrailingCodeExecutionResult()).toBe(
				false,
			);
			expect(
				new Event({
					author: "a",
					content: {
						parts: [
							{ codeExecutionResult: { output: "early" } },
							{ text: "after" },
						],
					},
				}).hasTrailingCodeExecutionResult(),
			).toBe(false);
			expect(
				new Event({
					author: "a",
					content: {
						parts: [{ text: "x" }, { codeExecutionResult: { output: "y" } }],
					},
				}).hasTrailingCodeExecutionResult(),
			).toBe(true);
		});

		it("applies constructor option matrix for ids and branch", () => {
			const actions = new EventActions({ skipSummarization: true });
			const event = new Event({
				author: "orchestrator",
				invocationId: "inv-custom",
				branch: "root.child",
				id: "fixedid1",
				timestamp: 1_700_000_000,
				actions,
				content: { role: "model", parts: [{ text: "hi" }] },
				partial: false,
				longRunningToolIds: new Set(["tool-a"]),
			});
			expect(event.invocationId).toBe("inv-custom");
			expect(event.branch).toBe("root.child");
			expect(event.id).toBe("fixedid1");
			expect(event.timestamp).toBe(1_700_000_000);
			expect(event.actions).toBe(actions);
			expect(event.longRunningToolIds?.has("tool-a")).toBe(true);
		});

		it("generates unique lowercase hex ids", () => {
			const ids = new Set(Array.from({ length: 24 }, () => Event.newId()));
			expect(ids.size).toBe(24);
			for (const id of ids) {
				expect(id).toMatch(/^[a-f0-9]{8}$/);
			}
		});

		it("includes function calls with undefined args", () => {
			const event = new Event({
				author: "agent",
				content: { parts: [{ functionCall: { name: "tool" } }] },
			});
			expect(event.getFunctionCalls()).toEqual([{ name: "tool" }]);
		});
	});

	describe("EventActions matrices", () => {
		it("defaults deltas to empty objects", () => {
			const actions = new EventActions();
			expect(actions.stateDelta).toEqual({});
			expect(actions.artifactDelta).toEqual({});
			expect(actions.skipSummarization).toBeUndefined();
		});

		it.each([
			{ skipSummarization: true },
			{ skipSummarization: false },
			{ escalate: true },
			{ escalate: false },
			{ transferToAgent: "helper" },
			{ transferToAgent: "" },
			{ rewindBeforeInvocationId: "inv-1" },
			{ rewindBeforeInvocationId: "" },
		])("accepts option matrix %j", (opts) => {
			const actions = new EventActions(opts);
			for (const [key, value] of Object.entries(opts)) {
				expect((actions as any)[key]).toBe(value);
			}
		});

		it("coalesces nullish deltas via || {}", () => {
			const actions = new EventActions({
				stateDelta: null as any,
				artifactDelta: undefined,
			});
			expect(actions.stateDelta).toEqual({});
			expect(actions.artifactDelta).toEqual({});
		});

		it("preserves empty requestedAuthConfigs and zero artifact versions", () => {
			const actions = new EventActions({
				requestedAuthConfigs: {},
				artifactDelta: { "out.txt": 0 },
			});
			expect(actions.requestedAuthConfigs).toEqual({});
			expect(actions.artifactDelta).toEqual({ "out.txt": 0 });
		});

		it("stores stateDelta and artifactDelta maps", () => {
			const actions = new EventActions({
				stateDelta: { foo: 1, bar: { nested: true } },
				artifactDelta: { "a.txt": 2, "b.bin": 3 },
			});
			expect(actions.stateDelta).toEqual({ foo: 1, bar: { nested: true } });
			expect(actions.artifactDelta).toEqual({ "a.txt": 2, "b.bin": 3 });
		});
	});

	describe("LlmEventSummarizer matrices", () => {
		let mockLlm: BaseLlm;
		let summarizer: LlmEventSummarizer;

		beforeEach(() => {
			mockLlm = { generateContentAsync: vi.fn() } as any;
			summarizer = new LlmEventSummarizer(mockLlm);
		});

		async function* summaryChunks(...texts: string[]) {
			for (const text of texts) {
				yield { content: { parts: [{ text }] } };
			}
		}

		it("returns undefined for empty/nullish lists without calling LLM", async () => {
			await expect(
				summarizer.maybeSummarizeEvents([]),
			).resolves.toBeUndefined();
			await expect(
				summarizer.maybeSummarizeEvents(null as any),
			).resolves.toBeUndefined();
			expect(mockLlm.generateContentAsync).not.toHaveBeenCalled();
		});

		it("summarizes text events with start/end timestamps", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("summary text"),
			);
			const result = await summarizer.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Hello" }] },
					timestamp: 1000,
				}),
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: { parts: [{ text: "Hi" }] },
					timestamp: 1100,
				}),
			]);
			expect(result?.actions?.compaction?.startTimestamp).toBe(1000);
			expect(result?.actions?.compaction?.endTimestamp).toBe(1100);
			expect(result?.actions?.compaction?.compactedContent.parts[0].text).toBe(
				"summary text",
			);
			expect(result?.author).toBe("user");
		});

		it("concatenates multi-chunk streamed summaries", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("part-", "a", "b", "-end"),
			);
			const result = await summarizer.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "hi" }] },
					timestamp: 10,
				}),
			]);
			expect(
				result?.actions.compaction?.compactedContent?.parts?.[0]?.text,
			).toBe("part-ab-end");
		});

		it("returns undefined for whitespace-only model output", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("   \n\t  "),
			);
			await expect(
				summarizer.maybeSummarizeEvents([
					new Event({
						invocationId: "inv-1",
						author: "user",
						content: { parts: [{ text: "Hello" }] },
						timestamp: 1,
					}),
				]),
			).resolves.toBeUndefined();
		});

		it("formats functionCall and functionResponse into the prompt", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("ok"),
			);
			await summarizer.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{
								functionCall: { name: "get_weather", args: { city: "SF" } },
							},
							{
								functionResponse: {
									name: "get_weather",
									response: { temp: 72 },
								},
							},
						],
					},
					timestamp: 1000,
				}),
			]);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("get_weather");
			expect(promptText).toContain("SF");
			expect(promptText).toContain('"temp":72');
		});

		it("stringifies omitted args as undefined and empty args as {}", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("ok"),
			);
			await summarizer.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "agent",
					content: {
						parts: [
							{ functionCall: { name: "no_args" } as any },
							{ functionCall: { name: "empty_args", args: {} } },
						],
					},
					timestamp: 1000,
				}),
			]);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("Called tool 'no_args' with args undefined");
			expect(promptText).toContain("Called tool 'empty_args' with args {}");
		});

		it("substitutes {events} in custom prompts", async () => {
			const custom = new LlmEventSummarizer(
				mockLlm,
				"Summarize:\n{events}\nDone.",
			);
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("bullet"),
			);
			await custom.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "Alpha" }] },
					timestamp: 1000,
				}),
			]);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toContain("Alpha");
			expect(promptText).not.toContain("{events}");
		});

		it("leaves prompts without {events} unchanged", async () => {
			const custom = new LlmEventSummarizer(
				mockLlm,
				"Static prompt with no placeholder",
			);
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("ok"),
			);
			await custom.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "secret-event-body" }] },
					timestamp: 1000,
				}),
			]);
			const promptText = (mockLlm.generateContentAsync as any).mock.calls[0][0]
				.contents[0].parts[0].text as string;
			expect(promptText).toBe("Static prompt with no placeholder");
			expect(promptText).not.toContain("secret-event-body");
		});

		it("propagates generateContentAsync rejections", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue({
				[Symbol.asyncIterator]() {
					return {
						async next() {
							throw new Error("llm down");
						},
					};
				},
			});
			await expect(
				summarizer.maybeSummarizeEvents([
					new Event({
						invocationId: "inv-1",
						author: "user",
						content: { parts: [{ text: "hi" }] },
						timestamp: 1,
					}),
				]),
			).rejects.toThrow("llm down");
		});

		it("uses identical start/end timestamps for single-event compaction", async () => {
			(mockLlm.generateContentAsync as any).mockReturnValue(
				summaryChunks("done"),
			);
			const result = await summarizer.maybeSummarizeEvents([
				new Event({
					invocationId: "inv-1",
					author: "user",
					content: { parts: [{ text: "solo" }] },
					timestamp: 4242,
				}),
			]);
			expect(result?.actions?.compaction?.startTimestamp).toBe(4242);
			expect(result?.actions?.compaction?.endTimestamp).toBe(4242);
		});
	});
});
