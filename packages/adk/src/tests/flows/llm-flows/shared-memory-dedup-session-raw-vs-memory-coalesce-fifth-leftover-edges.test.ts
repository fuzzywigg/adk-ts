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
		contents: LlmRequest["contents"] | null | undefined;
	}> = {},
): { context: InvocationContext; llmRequest: LlmRequest } {
	const llmRequest = new LlmRequest();
	if (overrides.contents !== undefined) {
		(llmRequest as any).contents = overrides.contents;
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
			events: overrides.events ?? [
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
 * Leftover asymmetry: sessionTexts stores raw p.text (undefined/null stay
 * undefined/null in the Set). Memory join uses p.text || "" so empty memory
 * becomes "" — sessionTexts.has("") is false when the Set only holds
 * undefined/null, so empty memory still injects "[author] said: ".
 */
describe("shared-memory dedup session-raw vs memory-coalesce fifth leftover edges", () => {
	it("session undefined text does not dedupe memory empty join", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{}] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [{ role: "user", parts: [{ text: undefined as any }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe("[past] said: ");
	});

	it("session null text does not dedupe memory empty join", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: null as any }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [{ role: "user", parts: [{ text: null as any }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe("[past] said: ");
	});

	it("session empty string text DOES dedupe memory empty join", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: { role: "user", parts: [{ text: "" }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [{ role: "user", parts: [{ text: "" }] }],
		});
		const before = llmRequest.contents?.length ?? 0;
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(before);
		expect(
			llmRequest.contents?.some((c) =>
				c.parts?.some((p) => p.text === "[past] said: "),
			),
		).toBeFalsy();
	});

	it("session undefined + null still injects empty memory (has('') false)", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "a",
					content: { role: "user", parts: [{}, { text: null as any }] },
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [
				{ role: "user", parts: [{ text: undefined as any }] },
				{ role: "model", parts: [{ text: null as any }] },
			],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		// memory join: "" + " " + "" => " "
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe("[a] said:  ");
	});

	it("session empty string dedupes multi-empty memory join to ''", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: {
						role: "user",
						parts: [{ text: "" }, { text: null as any }, {}],
					},
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [{ role: "user", parts: [{ text: "" }] }],
		});
		// memory join: "" + " " + "" + " " + "" => "  " — NOT equal to ""
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
			"[past] said:   ",
		);
	});

	it("session stores '  ' and dedupes multi-empty memory join exactly", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: {
						role: "user",
						parts: [{}, { text: "" }, {}],
					},
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [{ role: "user", parts: [{ text: "  " }] }],
		});
		const before = llmRequest.contents?.length ?? 0;
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(before);
	});
});
