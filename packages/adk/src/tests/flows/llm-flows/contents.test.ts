import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { requestProcessor } from "../../../flows/llm-flows/contents";
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

function makeSessionEvents(): Event[] {
	return [
		new Event({
			author: "user",
			invocationId: "inv-1",
			content: {
				role: "user",
				parts: [{ text: "hello first" }],
			},
		}),
		new Event({
			author: "test-agent",
			invocationId: "inv-1",
			content: {
				role: "model",
				parts: [{ text: "hello back" }],
			},
		}),
		new Event({
			author: "user",
			invocationId: "inv-2",
			content: {
				role: "user",
				parts: [{ text: "hello again" }],
			},
		}),
	];
}

function makeContext(
	agent: Record<string, unknown>,
	events: Event[] = makeSessionEvents(),
): InvocationContext {
	return {
		agent,
		branch: undefined,
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events,
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

describe("contents requestProcessor", () => {
	it("skips non-LlmAgent agents", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(makeContext({ name: "plain" }), llmRequest),
		);
		expect(llmRequest.contents).toBeUndefined();
	});

	it('includeContents "default" builds contents from session events', async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					name: "test-agent",
					canonicalModel: "gpt-4o",
					includeContents: "default",
				}),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toBeDefined();
		expect(llmRequest.contents!.length).toBeGreaterThanOrEqual(3);
		expect(
			llmRequest.contents!.some((c) =>
				c.parts?.some((p) => p.text === "hello first"),
			),
		).toBe(true);
		expect(
			llmRequest.contents!.some((c) =>
				c.parts?.some((p) => p.text === "hello again"),
			),
		).toBe(true);
	});

	it('includeContents "none" leaves contents unset', async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					name: "test-agent",
					canonicalModel: "gpt-4o",
					includeContents: "none",
				}),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toBeUndefined();
	});

	it("other includeContents uses current turn contents only", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					name: "test-agent",
					canonicalModel: "gpt-4o",
					includeContents: "none-history",
				}),
				llmRequest,
			),
		);

		expect(llmRequest.contents).toBeDefined();
		expect(
			llmRequest.contents!.some((c) =>
				c.parts?.some((p) => p.text === "hello again"),
			),
		).toBe(true);
		expect(
			llmRequest.contents!.some((c) =>
				c.parts?.some((p) => p.text === "hello first"),
			),
		).toBe(false);
	});
});
