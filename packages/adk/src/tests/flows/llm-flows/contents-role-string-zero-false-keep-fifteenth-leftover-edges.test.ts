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
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip 0e4d57c / #261, supersedes closed #262): twelfth leftover pins empty-string role skip and
 * whitespace keep via `!event.content.role`. String `"0"` / `"false"` are
 * truthy roles so the event is kept.
 */
describe("contents role string-zero/false keep fifteenth leftover", () => {
	it.each([
		{ label: '"0"', role: "0", text: "role-zero" },
		{ label: '"false"', role: "false", text: "role-false" },
	])("role $label is truthy so the event text is kept", async ({
		role,
		text,
	}) => {
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
						content: { role: role as any, parts: [{ text }] },
					}),
				]),
				request,
			),
		);

		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text),
		);
		expect(texts).toContain("keep-user");
		expect(texts).toContain(text);
	});

	it("empty-string role still skips (twelfth control)", async () => {
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
});
