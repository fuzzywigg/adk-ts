import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { requestProcessor } from "../../../flows/llm-flows/contents";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../../flows/llm-flows/functions";
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
 * Sixth leftover: isAuthEvent uses === REQUEST_EUC_FUNCTION_CALL_NAME.
 * Wrong-case names are kept in contents instead of being skipped.
 */
describe("contents EUC name case-sensitivity sixth leftover edges", () => {
	it("exact adk_request_credential functionCall is skipped as auth", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "assistant",
						content: {
							role: "model",
							parts: [
								{
									functionCall: {
										id: "euc-1",
										name: REQUEST_EUC_FUNCTION_CALL_NAME,
										args: {},
									},
								},
							],
						},
					}),
					new Event({
						author: "user",
						content: { role: "user", parts: [{ text: "go" }] },
					}),
				]),
				llmRequest,
			),
		);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some(
					(p) => p.functionCall?.name === REQUEST_EUC_FUNCTION_CALL_NAME,
				),
			),
		).toBe(false);
		expect(llmRequest.contents.map((c) => c.parts?.[0]?.text)).toContain("go");
	});

	it.each([
		"ADK_REQUEST_CREDENTIAL",
		"Adk_request_credential",
		"adk_request_credential ",
	] as const)("near-miss EUC name %j is kept (not isAuthEvent)", async (name) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				ctx([
					new Event({
						author: "assistant",
						content: {
							role: "model",
							parts: [
								{
									functionCall: {
										id: "euc-x",
										name,
										args: {},
									},
								},
							],
						},
					}),
				]),
				llmRequest,
			),
		);
		expect(
			llmRequest.contents.some((c) =>
				c.parts?.some((p) => p.functionCall?.name === name),
			),
		).toBe(true);
	});
});
