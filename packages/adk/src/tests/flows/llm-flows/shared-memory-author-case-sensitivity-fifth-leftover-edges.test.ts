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
 * Leftover: findLast uses strict author === "user". Near-miss author strings
 * never qualify even when parts are non-empty.
 */
describe("shared-memory author case-sensitivity fifth leftover edges", () => {
	const nonUserAuthors = [
		"User",
		"USER",
		"user ",
		" user",
		"User ",
		"uSer",
		"users",
		"agent",
		"model",
		"",
	];

	for (const author of nonUserAuthors) {
		it(`author ${JSON.stringify(author)} alone does not trigger search`, async () => {
			const searchMemory = vi.fn();
			const { context, llmRequest } = makeContext({
				memoryService: { searchMemory } as any,
				events: [
					new Event({
						author,
						content: { role: "user", parts: [{ text: "near-miss" }] },
					}),
				],
			});
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			expect(searchMemory).not.toHaveBeenCalled();
		});
	}

	it('only exact "user" qualifies among mixed near-miss authors', async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "User",
					content: { role: "user", parts: [{ text: "wrong-case" }] },
				}),
				new Event({
					author: "USER",
					content: { role: "user", parts: [{ text: "upper" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "exact" }] },
				}),
				new Event({
					author: "user ",
					content: { role: "user", parts: [{ text: "trailing-space" }] },
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledTimes(1);
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "exact" }),
		);
	});

	it("later exact user wins over earlier near-miss and earlier exact", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "earlier" }] },
				}),
				new Event({
					author: "User",
					content: { role: "user", parts: [{ text: "ignored" }] },
				}),
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "later" }] },
				}),
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith(
			expect.objectContaining({ query: "later" }),
		);
	});
});
