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

	it("uses the latest user event with parts as the memory query", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "first" }] },
				}),
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "ack" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "second query" }] },
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({
				appName: "app",
				userId: "u1",
				query: "second query",
			}),
		);
	});

	it("skips user events whose parts are empty", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "usable" }] },
				}),
			],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "usable" }),
		);
	});

	it("initializes contents when llmRequest.contents is undefined", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "injected memory" }] },
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
		llmRequest.contents = undefined as any;

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[0].text).toBe(
			"[past] said: injected memory",
		);
	});

	it("injects multiple distinct memories", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "a",
					content: { role: "user", parts: [{ text: "fact one" }] },
				},
				{
					author: "b",
					content: { role: "user", parts: [{ text: "fact two" }] },
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
			contents: [{ role: "user", parts: [{ text: "session" }] }],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(llmRequest.contents).toHaveLength(3);
		expect(llmRequest.contents?.[1].parts?.[0].text).toBe("[a] said: fact one");
		expect(llmRequest.contents?.[2].parts?.[0].text).toBe("[b] said: fact two");
	});

	it("joins multi-part memory text the same way as the query", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: {
						role: "user",
						parts: [{ text: "alpha" }, { text: "beta" }],
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
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(llmRequest.contents?.[0].parts?.[0].text).toBe(
			"[past] said: alpha beta",
		);
	});

	it("treats empty joined memory text as injectable when session lacks empty string", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "silent",
					content: {
						role: "user",
						parts: [{ text: "" }, {}],
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
			contents: [{ role: "user", parts: [{ text: "other" }] }],
		});

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));

		expect(llmRequest.contents).toHaveLength(2);
		expect(llmRequest.contents?.[1].parts?.[0].text).toBe("[silent] said:  ");
	});
});
