import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { sharedMemoryRequestProcessor } from "../../../flows/llm-flows/shared-memory";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

function makeContext(
	overrides: Partial<{
		memoryService: InvocationContext["memoryService"];
		events: Event[];
		contents: LlmRequest["contents"];
	}> = {},
): { context: InvocationContext; llmRequest: LlmRequest } {
	const llmRequest = new LlmRequest();
	if (overrides.contents) {
		llmRequest.contents = overrides.contents;
	}

	const context = {
		appName: "app",
		userId: "u1",
		agent: { name: "agent" },
		memoryService: overrides.memoryService,
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: overrides.events ?? [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;

	return { context, llmRequest };
}

describe("sharedMemoryRequestProcessor", () => {
	it("is a no-op without memoryService", async () => {
		const { context, llmRequest } = makeContext({
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "hi" }] },
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toEqual([]);
	});

	it("is a no-op without last user event", async () => {
		const searchMemory = vi.fn();
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "only agent" }] },
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).not.toHaveBeenCalled();
		expect(llmRequest.contents).toEqual([]);
	});

	it("injects memory contents not already in llmRequest.contents", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past-user",
					content: {
						role: "user",
						parts: [{ text: "remember this fact" }],
					},
				},
			],
		}));

		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "what did I say?" }] },
				}),
			],
			contents: [
				{
					role: "user",
					parts: [{ text: "existing session text" }],
				},
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(searchMemory).toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0].text).toBe(
			"[past-user] said: remember this fact",
		);
	});

	it("skips memories whose text already appears in sessionTexts", async () => {
		const memoryText = "already known";
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past-user",
					content: {
						role: "user",
						parts: [{ text: memoryText }],
					},
				},
			],
		}));

		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "query" }] },
				}),
			],
			contents: [
				{
					role: "user",
					parts: [{ text: memoryText }],
				},
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[0].text).toBe(memoryText);
	});

	it("leaves contents unchanged when searchMemory returns no memories", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "anything" }] },
				}),
			],
			contents: [
				{
					role: "user",
					parts: [{ text: "session-only" }],
				},
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(searchMemory).toHaveBeenCalled();
		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[0].text).toBe("session-only");
	});

	it("joins multi-part user text into the memory query", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [{ text: "hello" }, { text: "world" }],
					},
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({
				query: "hello world",
			}),
		);
	});

	it("ignores user events whose parts array is empty", async () => {
		const searchMemory = vi.fn();
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [] },
				}),
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "hi" }] },
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).not.toHaveBeenCalled();
	});

	it("builds memory query treating non-text user parts as empty strings", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [
							{ text: "hello" },
							{ inlineData: { mimeType: "image/png", data: "xx" } } as any,
							{ text: "world" },
						],
					},
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({
				query: "hello  world",
			}),
		);
	});

	it("initializes llmRequest.contents when undefined before injecting memory", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "fact" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
		});
		(llmRequest as any).contents = undefined;

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[0].text).toBe("[past] said: fact");
	});

	it("joins multi-part memory text when injecting", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: {
						role: "user",
						parts: [{ text: "one" }, { text: "two" }],
					},
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.[0].parts?.[0].text).toBe(
			"[past] said: one two",
		);
	});

	it("treats memory with missing parts as empty text for dedupe and inject", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user" },
				},
				{
					author: "past2",
					content: { role: "user", parts: undefined },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [
				{
					role: "user",
					parts: [{ text: "" }],
				},
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[0].text).toBe("");
	});

	it("injects multiple distinct memories in order", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "a",
					content: { role: "user", parts: [{ text: "first" }] },
				},
				{
					author: "b",
					content: { role: "user", parts: [{ text: "second" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.map((c) => c.parts?.[0].text)).toEqual([
			"[a] said: first",
			"[b] said: second",
		]);
	});

	it("uses the latest user event when earlier user events exist", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "old" }] },
				}),
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "reply" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "latest query" }] },
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "latest query" }),
		);
	});

	it("treats contents entries missing parts as empty for dedupe", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "fresh" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [{ role: "user" } as any, { role: "model", parts: undefined }],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.map((c) => c.parts?.[0]?.text)).toEqual([
			undefined,
			undefined,
			"[past] said: fresh",
		]);
	});

	it("puts undefined into the dedupe set for non-text content parts", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: {
						role: "user",
						parts: [
							{ inlineData: { mimeType: "image/png", data: "x" } } as any,
						],
					},
				},
				{
					author: "past2",
					content: { role: "user", parts: [{ text: "" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [
				{
					role: "user",
					parts: [{ inlineData: { mimeType: "image/png", data: "y" } } as any],
				},
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.map((c) => c.parts?.[0]?.text)).toEqual([
			undefined,
			"[past] said: ",
			"[past2] said: ",
		]);
	});

	it("injects memories whose parts are missing or only empty text", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "empty-parts",
					content: { role: "user", parts: [] },
				},
				{
					author: "blank",
					content: { role: "user", parts: [{ text: "" }, { text: "" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			contents: [{ role: "user", parts: [{ text: "already" }] }],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.map((c) => c.parts?.[0]?.text)).toEqual([
			"already",
			"[empty-parts] said: ",
			"[blank] said:  ",
		]);
	});
});
