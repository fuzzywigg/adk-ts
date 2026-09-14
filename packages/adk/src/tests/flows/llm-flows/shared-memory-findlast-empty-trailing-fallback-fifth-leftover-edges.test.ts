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
 * Leftover: findLast skips trailing user events with empty/falsy parts.length
 * and falls back to an earlier qualifying user event. Distinct from the
 * empty-user-only early-exit path already covered in shared-memory.test.ts.
 */
describe("shared-memory findLast empty-trailing fallback fifth leftover edges", () => {
	const fallbackMatrix: Array<{
		label: string;
		trailingParts: unknown;
		expectedQuery: string;
	}> = [
		{
			label: "empty trailing parts → earlier query",
			trailingParts: [],
			expectedQuery: "old query",
		},
		{
			label: "null parts → earlier query",
			trailingParts: null,
			expectedQuery: "old query",
		},
		{
			label: "undefined parts → earlier query",
			trailingParts: undefined,
			expectedQuery: "old query",
		},
	];

	for (const { label, trailingParts, expectedQuery } of fallbackMatrix) {
		it(label, async () => {
			const searchMemory = vi.fn(async () => ({ memories: [] }));
			const { context, llmRequest } = makeContext({
				memoryService: { searchMemory } as any,
				events: [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "old query" }] },
					}),
					new Event({
						author: "agent",
						content: { role: "model", parts: [{ text: "ack" }] },
					}),
					new Event({
						author: "user",
						content: { role: "user", parts: trailingParts as any },
					}),
				],
			});
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			expect(searchMemory).toHaveBeenCalledWith(
				expect.objectContaining({ query: expectedQuery }),
			);
		});
	}

	it("missing content on trailing user still falls back to earlier user", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "prior" }] },
				}),
				new Event({
					author: "user",
					content: undefined as any,
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "prior" }),
		);
	});

	it("content {} on trailing user still falls back to earlier user", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "seed" }] },
				}),
				new Event({
					author: "user",
					content: {} as any,
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "seed" }),
		);
	});

	it("two empty trailing users still resolve to the earliest qualifying user", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "first-good" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [] },
				}),
				new Event({
					author: "agent",
					content: { role: "model", parts: [{ text: "mid" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: null as any },
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledTimes(1);
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "first-good" }),
		);
	});

	it("latest non-empty user wins over earlier empties and agents", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "stale" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "fresh" }] },
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "fresh" }),
		);
	});
});
