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
	} as unknown as InvocationContext;
}

/**
 * Fifteenth leftover deepen (HEAVY tip-relaunch residual after tip #269 /
 * 03ff90a8; supersedes closed #273/#262): text `"0"`/`"false"` hasAnyContent
 * keep is already pinned. Sibling residual — `part.functionCall` string
 * `"0"` / `"false"` is also truthy so the event is kept. String
 * `functionResponse` passes hasAnyContent but later pairing/auth filters can
 * still drop it — pinned as the asymmetry control.
 */
describe("contents functionCall string-zero/false hasAnyContent fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("functionCall $label is truthy so the event is kept", async ({
		value,
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
						content: {
							role: "model",
							parts: [{ functionCall: value as any }],
						},
					}),
				]),
				request,
			),
		);

		expect(request.contents?.length ?? 0).toBeGreaterThanOrEqual(2);
		expect(
			(request.contents ?? []).some((c) =>
				(c.parts ?? []).some((p) => (p as any).functionCall === value),
			),
		).toBe(true);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("functionResponse $label passes hasAnyContent but is filtered later", async ({
		value,
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
						content: {
							role: "model",
							parts: [{ functionResponse: value as any }],
						},
					}),
				]),
				request,
			),
		);

		expect(
			(request.contents ?? []).some((c) =>
				(c.parts ?? []).some((p) => (p as any).functionResponse === value),
			),
		).toBe(false);
		expect(
			(request.contents ?? []).flatMap((c) =>
				(c.parts ?? []).map((p) => p.text),
			),
		).toContain("keep-user");
	});
});
