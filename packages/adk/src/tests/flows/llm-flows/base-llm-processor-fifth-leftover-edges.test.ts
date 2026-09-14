import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import {
	BaseLlmRequestProcessor,
	BaseLlmResponseProcessor,
} from "../../../flows/llm-flows/base-llm-processor";
import type { LlmRequest } from "../../../models/llm-request";
import type { LlmResponse } from "../../../models/llm-response";

async function collect(
	gen: AsyncGenerator<Event, void, unknown>,
): Promise<Event[]> {
	const events: Event[] = [];
	for await (const event of gen) {
		events.push(event);
	}
	return events;
}

class MultiYieldRequestProcessor extends BaseLlmRequestProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmRequest: LlmRequest,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({
			author: "req-a",
			content: { role: "model", parts: [{ text: "1" }] },
		});
		yield new Event({
			author: "req-b",
			content: { role: "model", parts: [{ text: "2" }] },
		});
		yield new Event({
			author: "req-c",
			content: { role: "model", parts: [{ text: "3" }] },
		});
	}
}

class PassthroughResponseProcessor extends BaseLlmResponseProcessor {
	lastResponse: LlmResponse | undefined;

	async *runAsync(
		_invocationContext: InvocationContext,
		llmResponse: LlmResponse,
	): AsyncGenerator<Event, void, unknown> {
		this.lastResponse = llmResponse;
		yield new Event({
			author: "resp",
			content: llmResponse.content,
		});
	}
}

class ThrowingRequestProcessor extends BaseLlmRequestProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmRequest: LlmRequest,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: "before-throw" });
		throw new Error("request-processor-boom");
	}
}

class ThrowingResponseProcessor extends BaseLlmResponseProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmResponse: LlmResponse,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: "before-throw-resp" });
		throw new Error("response-processor-boom");
	}
}

class ImmediateThrowRequestProcessor extends BaseLlmRequestProcessor {
	// biome-ignore lint/correctness/useYield: throws before yielding
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmRequest: LlmRequest,
	): AsyncGenerator<Event, void, unknown> {
		throw new Error("immediate-request-fail");
	}
}

describe("BaseLlmProcessor fifth leftover edges (post #146)", () => {
	it("request processor multi-yield contract drains all events in order", async () => {
		const events = await collect(
			new MultiYieldRequestProcessor().runAsync(
				{} as InvocationContext,
				{} as LlmRequest,
			),
		);
		expect(events.map((e) => e.author)).toEqual(["req-a", "req-b", "req-c"]);
		expect(events.map((e) => e.content?.parts?.[0]?.text)).toEqual([
			"1",
			"2",
			"3",
		]);
	});

	it("response processor receives llmResponse argument pass-through", async () => {
		const processor = new PassthroughResponseProcessor();
		const llmResponse = {
			content: { role: "model", parts: [{ text: "payload" }] },
			finishReason: "STOP",
		} as LlmResponse;

		const events = await collect(
			processor.runAsync({} as InvocationContext, llmResponse),
		);

		expect(processor.lastResponse).toBe(llmResponse);
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("payload");
	});

	it("request processor throw after yield propagates and preserves prior event", async () => {
		const gen = new ThrowingRequestProcessor().runAsync(
			{} as InvocationContext,
			{} as LlmRequest,
		);
		const first = await gen.next();
		expect(first.done).toBe(false);
		expect(first.value?.author).toBe("before-throw");
		await expect(gen.next()).rejects.toThrow("request-processor-boom");
	});

	it("response processor throw after yield propagates", async () => {
		const gen = new ThrowingResponseProcessor().runAsync(
			{} as InvocationContext,
			{} as LlmResponse,
		);
		const first = await gen.next();
		expect(first.value?.author).toBe("before-throw-resp");
		await expect(gen.next()).rejects.toThrow("response-processor-boom");
	});

	it("immediate request throw before any yield rejects on first next()", async () => {
		const gen = new ImmediateThrowRequestProcessor().runAsync(
			{} as InvocationContext,
			{} as LlmRequest,
		);
		await expect(gen.next()).rejects.toThrow("immediate-request-fail");
	});

	it("concrete subclasses remain instanceof abstract bases", () => {
		expect(new MultiYieldRequestProcessor()).toBeInstanceOf(
			BaseLlmRequestProcessor,
		);
		expect(new PassthroughResponseProcessor()).toBeInstanceOf(
			BaseLlmResponseProcessor,
		);
	});
});
