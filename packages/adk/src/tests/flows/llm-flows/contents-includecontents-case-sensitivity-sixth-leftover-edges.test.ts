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
		/* no events */
	}
}

function userEvent(text: string): Event {
	return new Event({
		author: "user",
		content: { role: "user", parts: [{ text }] },
	});
}

function ctx(includeContents: string, events: Event[]): InvocationContext {
	return {
		agent: {
			name: "assistant",
			canonicalModel: "gpt-4o",
			includeContents,
		},
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

/**
 * Sixth leftover: ContentLlmRequestProcessor uses === "default" / !== "none"
 * (case-sensitive). Wrong-case values skip full history and take the current
 * turn branch instead of the none early-out.
 */
describe("contents includeContents case-sensitivity sixth leftover edges", () => {
	const history = [userEvent("history"), userEvent("followup")];

	it("exact default includes full history", async () => {
		const llmRequest = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx("default", history), llmRequest));
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"history",
			"followup",
		]);
	});

	it("exact none leaves contents untouched", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.contents = [{ role: "user", parts: [{ text: "preset" }] }];
		await drain(requestProcessor.runAsync(ctx("none", history), llmRequest));
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"preset",
		]);
	});

	it.each([
		"Default",
		"DEFAULT",
		"None",
		"NONE",
	] as const)("%j is not default/none so current-turn contents drop earlier history", async (includeContents) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(ctx(includeContents, history), llmRequest),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"followup",
		]);
	});
});
