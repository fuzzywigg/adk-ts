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

/**
 * Leftover: searchMemory always receives invocationContext.appName / userId
 * and the joined query — independent of session.events app/user metadata.
 */
describe("shared-memory search-args passthrough fifth leftover edges", () => {
	it("forwards appName and userId from invocationContext", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const llmRequest = new LlmRequest();
		const context = {
			appName: "forward-app",
			userId: "forward-user",
			agent: { name: "agent" },
			memoryService: { searchMemory },
			session: {
				id: "s1",
				appName: "session-app-ignored",
				userId: "session-user-ignored",
				state: {},
				events: [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "hello" }] },
					}),
				],
				lastUpdateTime: 0,
			},
		} as unknown as InvocationContext;

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith({
			appName: "forward-app",
			userId: "forward-user",
			query: "hello",
		});
	});

	it("empty appName/userId still forwarded as-is", async () => {
		const searchMemory = vi.fn(async () => ({ memories: [] }));
		const llmRequest = new LlmRequest();
		const context = {
			appName: "",
			userId: "",
			agent: { name: "agent" },
			memoryService: { searchMemory },
			session: {
				id: "s1",
				appName: "x",
				userId: "y",
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

		await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
		expect(searchMemory).toHaveBeenCalledWith({
			appName: "",
			userId: "",
			query: "q",
		});
	});

	it("falsy memoryService (0/false/'') still early-exits without search", async () => {
		for (const memoryService of [0, false, ""] as unknown[]) {
			const llmRequest = new LlmRequest();
			const context = {
				appName: "app",
				userId: "u",
				agent: { name: "agent" },
				memoryService,
				session: {
					id: "s1",
					appName: "app",
					userId: "u",
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
			await drain(sharedMemoryRequestProcessor.runAsync(context, llmRequest));
			expect(llmRequest.contents).toEqual([]);
		}
	});
});
