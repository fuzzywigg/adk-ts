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

function duckAgent(name: string) {
	return {
		name,
		canonicalModel: "gpt-4o",
		includeContents: "current_turn" as const,
	};
}

function ctx(agent: object, events: Event[]): InvocationContext {
	return {
		agent,
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

function allTexts(request: LlmRequest): string[] {
	return (request.contents ?? []).flatMap((c) =>
		(c.parts ?? []).map((p) => p.text ?? ""),
	);
}

describe("contents getCurrentTurnContents author === user case twelfth leftover", () => {
	it('exact "user" starts the current turn as a real user message', async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant"), [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "old-turn" }] },
					}),
					new Event({
						author: "assistant",
						content: { role: "model", parts: [{ text: "old-reply" }] },
					}),
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "latest-user" }] },
					}),
				]),
				request,
			),
		);

		const texts = allTexts(request);
		expect(texts).toContain("latest-user");
		expect(texts).not.toContain("old-turn");
		expect(texts.join(" ")).not.toContain("For context:");
	});

	it('author "USER" is not === "user" so isOtherAgentReply rewrites it as foreign', async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("assistant"), [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "old-turn" }] },
					}),
					new Event({
						author: "USER",
						content: { role: "user", parts: [{ text: "cased-user" }] },
					}),
				]),
				request,
			),
		);

		const texts = allTexts(request);
		expect(texts.join(" ")).toContain("For context:");
		expect(texts.join(" ")).toContain("[USER] said: cased-user");
		expect(texts).not.toContain("old-turn");
		expect(texts).not.toContain("cased-user");
	});

	it('author "USER" matching agent.name is neither user nor other-agent so walk continues', async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx(duckAgent("USER"), [
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "real-user" }] },
					}),
					new Event({
						author: "USER",
						content: { role: "model", parts: [{ text: "self-cased" }] },
					}),
				]),
				request,
			),
		);

		const texts = allTexts(request);
		expect(texts).toContain("real-user");
		expect(texts).toContain("self-cased");
	});
});
