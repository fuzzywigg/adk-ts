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

describe("contents convertForeignEvent if (part.text) twelfth leftover", () => {
	it("whitespace text is truthy so the said-branch keeps the spaces", async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "peer",
						content: { role: "model", parts: [{ text: " " }] },
					}),
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "cont" }] },
					}),
				]),
				request,
			),
		);

		const rewritten = request.contents.find((c) =>
			(c.parts ?? []).some((p) =>
				String(p.text ?? "").includes("For context:"),
			),
		);
		expect(rewritten?.parts?.map((p) => p.text)).toContain("[peer] said:  ");
	});

	it("empty text plus functionCall falls through to the tool-stringify branch", async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "peer",
						content: {
							role: "model",
							parts: [
								{
									text: "",
									functionCall: { name: "lookup", args: { q: 1 } },
								},
							],
						},
					}),
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "cont" }] },
					}),
				]),
				request,
			),
		);

		const texts = (request.contents[0].parts ?? []).map((p) => p.text ?? "");
		expect(texts.some((t) => t.includes("[peer] said:"))).toBe(false);
		expect(texts.some((t) => t.includes("[peer] called tool `lookup`"))).toBe(
			true,
		);
	});
});
