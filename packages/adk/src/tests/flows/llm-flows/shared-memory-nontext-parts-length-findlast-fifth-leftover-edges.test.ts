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
	}> = {},
): { context: InvocationContext; llmRequest: LlmRequest } {
	const llmRequest = new LlmRequest();
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

/**
 * Leftover: findLast only checks parts?.length — non-text parts (inlineData,
 * functionCall, empty objects) still qualify as a user event even when the
 * resulting query join is spaces-only / empty.
 */
describe("shared-memory nontext parts length findLast fifth leftover edges", () => {
	it("inlineData-only parts qualify and search with empty-ish query", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [
							{
								inlineData: { mimeType: "image/png", data: "abc" },
							} as any,
						],
					},
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "" }),
		);
	});

	it("empty-object parts qualify (length>0) with empty query string", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{}] as any },
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "" }),
		);
	});

	it("non-text trailing user beats earlier text user for findLast", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "should-not-win" }] },
				}),
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [{ functionCall: { name: "tool", args: {} } } as any],
					},
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "" }),
		);
	});

	it("mixed non-text + text joins with empty slots for non-text", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [
							{ inlineData: { mimeType: "text/plain", data: "eQ==" } } as any,
							{ text: "keep" },
							{ functionResponse: { name: "x", response: {} } } as any,
						],
					},
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: " keep " }),
		);
	});

	it("null text part object still counts toward parts.length", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: {
						role: "user",
						parts: [{ text: null as any }],
					},
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "" }),
		);
	});
});
