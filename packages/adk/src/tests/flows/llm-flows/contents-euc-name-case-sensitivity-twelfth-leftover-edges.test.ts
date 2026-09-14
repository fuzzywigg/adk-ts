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

function duckAgent() {
	return {
		name: "assistant",
		canonicalModel: "gpt-4o",
		includeContents: "default" as const,
	};
}

function ctx(events: Event[]): InvocationContext {
	return {
		agent: duckAgent(),
		session: { events },
		runConfig: {},
	} as unknown as InvocationContext;
}

async function textsForAuthName(name: string): Promise<string[]> {
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
						parts: [
							{
								functionCall: {
									id: "euc-1",
									name,
									args: {},
								},
							},
						],
					},
				}),
			]),
			request,
		),
	);
	return (request.contents ?? []).flatMap((c) =>
		(c.parts ?? []).map((p) => p.functionCall?.name ?? p.text ?? ""),
	);
}

describe("contents isAuthEvent name === case twelfth leftover (post #181 preprocessor)", () => {
	it("exact adk_request_credential is skipped as an auth event", async () => {
		const texts = await textsForAuthName(REQUEST_EUC_FUNCTION_CALL_NAME);
		expect(texts).toContain("keep-user");
		expect(texts).not.toContain(REQUEST_EUC_FUNCTION_CALL_NAME);
	});

	it.each([
		{ label: "uppercase", name: "ADK_REQUEST_CREDENTIAL" },
		{ label: "mixed case", name: "Adk_request_credential" },
		{ label: "trailing space", name: "adk_request_credential " },
	])("$label EUC name is not === so the functionCall is kept", async ({
		name,
	}) => {
		const texts = await textsForAuthName(name);
		expect(texts).toContain("keep-user");
		expect(texts).toContain(name);
	});
});
