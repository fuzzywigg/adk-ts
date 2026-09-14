import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { requestProcessor } from "../../auth/auth-preprocessor";
import { Event } from "../../events/event";
import { REQUEST_EUC_FUNCTION_CALL_NAME } from "../../flows/llm-flows/functions";
import { LlmRequest } from "../../models/llm-request";

const handleFunctionCallsAsyncMock = vi.hoisted(() => vi.fn());

vi.mock("../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../flows/llm-flows/functions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../flows/llm-flows/functions")>();
	return {
		...actual,
		handleFunctionCallsAsync: handleFunctionCallsAsyncMock,
	};
});

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
});

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function baseCtx(events: Event[]): InvocationContext {
	return {
		agent: {
			name: "auth-agent",
			canonicalTools: async () => [],
		},
		session: {
			events,
			state: {},
		},
		runConfig: {},
	} as unknown as InvocationContext;
}

function eucResponse(author: unknown, id: string): Event {
	const event = new Event({
		author: "placeholder",
		content: {
			role: "user",
			parts: [
				{
					functionResponse: {
						id,
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
	(event as { author: unknown }).author = author;
	return event;
}

/**
 * Twelfth leftover: `!event.author || author !== "user"` — falsy author
 * continues the reverse scan (never treated as the user EUC event).
 */
describe("auth-preprocessor author falsy-continue twelfth leftover edges", () => {
	it.each([
		"",
		null,
		undefined,
		0,
		false,
	])("author %j is not user; EUC payload is skipped", async (author) => {
		await collect(
			requestProcessor.runAsync(
				baseCtx([eucResponse(author, "euc-falsy")]),
				new LlmRequest(),
			),
		);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it("falsy trailing author does not hide earlier exact user EUC", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);
		const original = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "tool-1",
							name: "secure_api",
							args: { q: "x" },
						},
					},
				],
			},
		});
		const eucCall = new Event({
			author: "auth-agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "tool-1" }),
						},
					},
				],
			},
		});

		await collect(
			requestProcessor.runAsync(
				{
					...baseCtx([
						original,
						eucCall,
						eucResponse("user", "euc-1"),
						eucResponse("", "euc-ignored"),
					]),
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
				} as InvocationContext,
				new LlmRequest(),
			),
		);

		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		warn.mockRestore();
	});
});
