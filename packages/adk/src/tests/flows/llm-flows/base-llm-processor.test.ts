import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import {
	BaseLlmRequestProcessor,
	BaseLlmResponseProcessor,
} from "../../../flows/llm-flows/base-llm-processor";
import type { LlmRequest } from "../../../models/llm-request";
import type { LlmResponse } from "../../../models/llm-response";

class EmptyRequestProcessor extends BaseLlmRequestProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmRequest: LlmRequest,
	): AsyncGenerator<Event, void, unknown> {
		// yields nothing
	}
}

class OneEventRequestProcessor extends BaseLlmRequestProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmRequest: LlmRequest,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: "request-processor" });
	}
}

class EmptyResponseProcessor extends BaseLlmResponseProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmResponse: LlmResponse,
	): AsyncGenerator<Event, void, unknown> {
		// yields nothing
	}
}

class OneEventResponseProcessor extends BaseLlmResponseProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmResponse: LlmResponse,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: "response-processor" });
	}
}

class MultiEventRequestProcessor extends BaseLlmRequestProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmRequest: LlmRequest,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: "a" });
		yield new Event({ author: "b" });
	}
}

class MultiEventResponseProcessor extends BaseLlmResponseProcessor {
	async *runAsync(
		_invocationContext: InvocationContext,
		_llmResponse: LlmResponse,
	): AsyncGenerator<Event, void, unknown> {
		yield new Event({ author: "x" });
		yield new Event({ author: "y" });
	}
}

async function collect(
	gen: AsyncGenerator<Event, void, unknown>,
): Promise<Event[]> {
	const events: Event[] = [];
	for await (const event of gen) {
		events.push(event);
	}
	return events;
}

describe("BaseLlmRequestProcessor", () => {
	it("stub can yield no events", async () => {
		const processor = new EmptyRequestProcessor();
		const events = await collect(
			processor.runAsync({} as InvocationContext, {} as LlmRequest),
		);
		expect(events).toEqual([]);
	});

	it("stub can yield one event", async () => {
		const processor = new OneEventRequestProcessor();
		const events = await collect(
			processor.runAsync({} as InvocationContext, {} as LlmRequest),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("request-processor");
	});

	it("stub can yield multiple events in order", async () => {
		const processor = new MultiEventRequestProcessor();
		const events = await collect(
			processor.runAsync({} as InvocationContext, {} as LlmRequest),
		);
		expect(events.map((e) => e.author)).toEqual(["a", "b"]);
	});
});

describe("BaseLlmResponseProcessor", () => {
	it("stub can yield no events", async () => {
		const processor = new EmptyResponseProcessor();
		const events = await collect(
			processor.runAsync({} as InvocationContext, {} as LlmResponse),
		);
		expect(events).toEqual([]);
	});

	it("stub can yield one event", async () => {
		const processor = new OneEventResponseProcessor();
		const events = await collect(
			processor.runAsync({} as InvocationContext, {} as LlmResponse),
		);
		expect(events).toHaveLength(1);
		expect(events[0].author).toBe("response-processor");
	});

	it("stub can yield multiple events in order", async () => {
		const processor = new MultiEventResponseProcessor();
		const events = await collect(
			processor.runAsync({} as InvocationContext, {} as LlmResponse),
		);
		expect(events.map((e) => e.author)).toEqual(["x", "y"]);
	});
});
