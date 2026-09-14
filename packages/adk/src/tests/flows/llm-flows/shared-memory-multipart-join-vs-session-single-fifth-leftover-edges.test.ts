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
		contents: LlmRequest["contents"];
	}> = {},
): { context: InvocationContext; llmRequest: LlmRequest } {
	const llmRequest = new LlmRequest();
	if (overrides.contents !== undefined) {
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
 * Leftover: memory multi-part join ("one"+"two" → "one two") dedupes only
 * against the joined string in sessionTexts — single-part "one" or "two"
 * alone does not suppress injection.
 */
describe("shared-memory multipart join vs session single fifth leftover edges", () => {
	it("session single 'one two' dedupes memory parts ['one','two']", async () => {
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
			contents: [{ role: "user", parts: [{ text: "one two" }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(1);
		expect(llmRequest.contents?.[0].parts?.[0]?.text).toBe("one two");
	});

	it("session 'one' alone does not dedupe joined 'one two'", async () => {
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
			contents: [{ role: "user", parts: [{ text: "one" }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
			"[past] said: one two",
		);
	});

	it("session 'two' alone does not dedupe joined 'one two'", async () => {
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
			contents: [{ role: "user", parts: [{ text: "two" }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
			"[past] said: one two",
		);
	});

	it("session parts ['one','two'] store separately — do not dedupe joined memory", async () => {
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
			contents: [{ role: "user", parts: [{ text: "one" }, { text: "two" }] }],
		});
		// sessionTexts has "one" and "two", not "one two"
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
			"[past] said: one two",
		);
	});

	it("session joined via separate contents still needs exact 'one two' string", async () => {
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
			contents: [
				{ role: "user", parts: [{ text: "alpha" }] },
				{ role: "user", parts: [{ text: "beta" }] },
				{ role: "user", parts: [{ text: "alpha beta" }] },
			],
		});
		const before = llmRequest.contents?.length ?? 0;
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents).toHaveLength(before);
	});

	it("three-part memory join requires exact triple join in session", async () => {
		const searchMemory = vi.fn(async () => ({
			memories: [
				{
					author: "past",
					content: {
						role: "user",
						parts: [{ text: "a" }, { text: "b" }, { text: "c" }],
					},
				},
			],
		}));
		const { context, llmRequest } = makeContext({
			memoryService: { searchMemory } as any,
			contents: [{ role: "user", parts: [{ text: "a b" }] }],
		});
		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(llmRequest.contents?.at(-1)?.parts?.[0]?.text).toBe(
			"[past] said: a b c",
		);
	});
});
