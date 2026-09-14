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

function eucResponse(author: string, id: string): Event {
	return new Event({
		author,
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
}

describe("auth-preprocessor author case-sensitivity seventh leftover (post #160)", () => {
	it.each([
		"USER",
		"User",
		"uSer",
		"USER ",
	])('author %j !== exact "user" skips EUC scan (no resume)', async (author) => {
		await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [eucResponse(author, `euc-${author}`)],
				}),
				new LlmRequest(),
			),
		);

		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it('exact lowercase "user" still enters EUC path (control)', async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [eucResponse("user", "euc-ok")],
				}),
				new LlmRequest(),
			),
		);

		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("case-mismatched author after real user does not block earlier exact user", async () => {
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
		const userOk = eucResponse("user", "euc-1");
		const upperTail = eucResponse("USER", "euc-ignored");

		await collect(
			requestProcessor.runAsync(
				baseCtx({
					agent: {
						name: "auth-agent",
						canonicalTools: async () => [{ name: "secure_api" }],
					},
					events: [original, eucCall, userOk, upperTail],
				}),
				new LlmRequest(),
			),
		);

		expect(handleFunctionCallsAsyncMock).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});
