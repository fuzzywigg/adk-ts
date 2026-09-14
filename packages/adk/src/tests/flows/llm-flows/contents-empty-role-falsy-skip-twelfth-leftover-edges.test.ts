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

describe("contents !content.role falsy skip twelfth leftover", () => {
	it("empty-string role is falsy so a text-bearing event is dropped", async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "keep-user" }] },
					}),
					new Event({
						author: "assistant",
						content: { role: "" as any, parts: [{ text: "empty-role" }] },
					}),
				]),
				request,
			),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text),
		);
		expect(texts).toContain("keep-user");
		expect(texts).not.toContain("empty-role");
	});

	it("whitespace role is truthy so the event is kept", async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "user",
						content: { role: " ", parts: [{ text: "space-role" }] },
					}),
				]),
				request,
			),
		);

		expect(
			(request.contents ?? []).some((c) =>
				(c.parts ?? []).some((p) => p.text === "space-role"),
			),
		).toBe(true);
	});
});
