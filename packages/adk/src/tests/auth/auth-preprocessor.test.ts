import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { requestProcessor } from "../../auth/auth-preprocessor";
import { Event } from "../../events/event";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../flows/llm-flows/functions";
import { LlmRequest } from "../../models/llm-request";

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function baseCtx(
	overrides: Partial<{
		agent: object;
		events: Event[];
		state: Record<string, unknown>;
	}> = {},
): InvocationContext {
	return {
		agent: overrides.agent ?? {
			name: "auth-agent",
			canonicalTools: async () => [],
		},
		session: {
			events: overrides.events ?? [],
			state: overrides.state ?? {},
		},
		runConfig: {},
	} as unknown as InvocationContext;
}

describe("auth requestProcessor", () => {
	it("returns immediately for agents without canonicalTools", async () => {
		const llmRequest = new LlmRequest();
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ agent: { name: "plain" } }),
				llmRequest,
			),
		);
		expect(events).toEqual([]);
	});

	it("returns immediately when session has no events", async () => {
		const events = await collect(
			requestProcessor.runAsync(baseCtx({ events: [] }), new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("returns when the latest user event has no function responses", async () => {
		const user = new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "hello" }] },
		});
		const events = await collect(
			requestProcessor.runAsync(baseCtx({ events: [user] }), new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("returns when user responses are not request-credential EUC", async () => {
		const user = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "fr-1",
							name: "other_tool",
							response: { ok: true },
						},
					},
				],
			},
		});
		const events = await collect(
			requestProcessor.runAsync(baseCtx({ events: [user] }), new LlmRequest()),
		);
		expect(events).toEqual([]);
	});

	it("ignores non-user events while scanning backwards for auth responses", async () => {
		const agentEvt = new Event({
			author: "assistant",
			content: {
				role: "model",
				parts: [
					{
						functionResponse: {
							id: "fr-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: "{}",
						},
					},
				],
			},
		});
		const user = new Event({
			author: "user",
			content: { role: "user", parts: [{ text: "hi" }] },
		});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ events: [agentEvt, user] }),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});

	it("does not yield when EUC response is present but no matching prior call exists", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const eucResponse = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-resp",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
								rawAuthCredential: { apiKey: "k" },
							}),
						},
					},
				],
			},
		});

		const events = await collect(
			requestProcessor.runAsync(
				baseCtx({ events: [eucResponse] }),
				new LlmRequest(),
			),
		);

		expect(events).toEqual([]);
		warn.mockRestore();
	});
});
