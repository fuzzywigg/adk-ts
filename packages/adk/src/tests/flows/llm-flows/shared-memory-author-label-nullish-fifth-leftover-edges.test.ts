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
	}> = {},
): { context: InvocationContext; llmRequest: LlmRequest } {
	const llmRequest = new LlmRequest();
	llmRequest.contents = [];
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
			events: [
				new Event({
					author: "user",
					content: { role: "user", parts: [{ text: "q" }] },
				}),
			],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
	return { context, llmRequest };
}

/**
 * Leftover: inject label uses `[${memory.author}]` with no nullish coalesce —
 * undefined/null/empty authors stringify into the bracket label as-is.
 */
describe("shared-memory author-label nullish fifth leftover edges", () => {
	const authorMatrix: Array<{
		label: string;
		author: unknown;
		expectedPrefix: string;
	}> = [
		{
			label: "undefined author",
			author: undefined,
			expectedPrefix: "[undefined] said: ",
		},
		{
			label: "null author",
			author: null,
			expectedPrefix: "[null] said: ",
		},
		{
			label: "empty string author",
			author: "",
			expectedPrefix: "[] said: ",
		},
		{
			label: "numeric author",
			author: 0,
			expectedPrefix: "[0] said: ",
		},
		{
			label: "false author",
			author: false,
			expectedPrefix: "[false] said: ",
		},
		{
			label: "normal author",
			author: "alice",
			expectedPrefix: "[alice] said: ",
		},
	];

	for (const { label, author, expectedPrefix } of authorMatrix) {
		it(label, async () => {
			const searchMemory = vi.fn(async () => ({
				memories: [
					{
						author,
						content: { role: "user", parts: [{ text: "fact" }] },
					},
				],
			}));
			const { context, llmRequest } = makeContext({
				memoryService: { searchMemory } as any,
			});
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			expect(llmRequest.contents?.[0]?.parts?.[0]?.text).toBe(
				`${expectedPrefix}fact`,
			);
		});
	}

	it("duplicate memory texts with distinct nullish authors both inject", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: undefined,
					content: { role: "user", parts: [{ text: "same" }] },
				},
				{
					author: null,
					content: { role: "user", parts: [{ text: "same" }] },
				},
				{
					author: "",
					content: { role: "user", parts: [{ text: "same" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		// sessionTexts is built once from prior contents; injected memories are
		// not added back into the Set, so duplicate memoryText still injects.
		expect(llmRequest.contents?.map((c) => c.parts?.[0]?.text)).toEqual([
			"[undefined] said: same",
			"[null] said: same",
			"[] said: same",
		]);
	});
});
