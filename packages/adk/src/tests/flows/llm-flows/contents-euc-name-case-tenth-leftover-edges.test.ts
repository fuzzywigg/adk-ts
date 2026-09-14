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
			name: "agent",
			canonicalModel: "gpt-4o",
			includeContents: "default",
		},
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("contents isAuthEvent EUC name case-sensitivity tenth leftover", () => {
	it("exact adk_request_credential functionCall is filtered from history", async () => {
		const events = [
			new Event({
				author: "user",
				content: { role: "user", parts: [{ text: "keep" }] },
			}),
			new Event({
				author: "agent",
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
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		const names = (request.contents ?? []).flatMap((c) =>
			(c.parts ?? []).map((p) => p.functionCall?.name).filter(Boolean),
		);
		expect(names).not.toContain(REQUEST_EUC_FUNCTION_CALL_NAME);
		expect(
			(request.contents ?? []).some((c) => c.parts?.[0]?.text === "keep"),
		).toBe(true);
	});

	it.each([
		"ADK_REQUEST_CREDENTIAL",
		"Adk_request_credential",
		"adk_Request_credential",
	])("near-miss EUC name %j stays in contents (=== is case-sensitive)", async (name) => {
		const events = [
			new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [{ functionCall: { id: "x", name, args: {} } }],
				},
			}),
		];
		const request = new LlmRequest();
		await drain(requestProcessor.runAsync(ctx(events), request));
		expect(request.contents?.[0]?.parts?.[0]?.functionCall?.name).toBe(name);
	});
});
