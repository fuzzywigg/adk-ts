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

function ctx(events: Event[]): InvocationContext {
	return {
		agent: {
			name: "assistant",
			canonicalModel: "gpt-4o",
			includeContents: "default",
		},
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

/**
 * Sixth leftover: isOtherAgentReply / getCurrentTurnContents compare
 * `event.author !== "user"` / `=== "user"` case-sensitively, so `User`/`USER`
 * are treated as foreign agents and rewritten via convertForeignEvent.
 */
describe("contents author user case-sensitivity sixth leftover edges", () => {
	it.each([
		"User",
		"USER",
	] as const)("author %j is converted as a foreign agent (For context:)", async (author) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author,
						content: { role: "model", parts: [{ text: "hello" }] },
					}),
				]),
				llmRequest,
			),
		);
		const texts = (llmRequest.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p: any) => p.text),
		);
		expect(texts).toContain("For context:");
		expect(texts).toContain(`[${author}] said: hello`);
		expect(llmRequest.contents?.[0]?.role).toBe("user");
	});

	it("lowercase user stays a real user turn (control)", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "hello" }] },
					}),
				]),
				llmRequest,
			),
		);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toEqual([
			"hello",
		]);
		expect(llmRequest.contents[0].role).toBe("user");
	});
});
