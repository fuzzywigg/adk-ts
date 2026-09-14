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
 * Nineteenth leftover (flows residual): `part.text || part.functionCall || …`
 * and convertForeignEvent `if (part.text)` — numeric 0 dropped, string "0" kept.
 */
describe("contents text zero vs string-zero nineteenth leftover", () => {
	it("lone text:0/false are dropped from llmRequest.contents", async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "user",
						content: {
							role: "user",
							parts: [{ text: 0 as any }, { text: false as any }],
						},
					}),
				]),
				request,
			),
		);
		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text),
		);
		expect(texts).not.toContain(0);
		expect(texts).not.toContain(false);
	});

	it('lone text:"0"/"false" are kept', async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "user",
						content: {
							role: "user",
							parts: [{ text: "0" }, { text: "false" }],
						},
					}),
				]),
				request,
			),
		);
		const texts = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.text),
		);
		expect(texts).toContain("0");
		expect(texts).toContain("false");
	});

	it('foreign peer text:"0" uses said-branch', async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "peer",
						content: { role: "model", parts: [{ text: "0" }] },
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
		expect(rewritten?.parts?.map((p) => p.text)).toContain("[peer] said: 0");
	});

	it("foreign peer text:0 plus functionCall falls through to tool-stringify", async () => {
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
									text: 0 as any,
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
		const allText = (request.contents ?? [])
			.flatMap((c) => (c.parts ?? []).map((p) => String(p.text ?? "")))
			.join("\n");
		expect(allText).not.toContain("[peer] said:");
		expect(allText).toMatch(/lookup|functionCall|tool/i);
	});
});
