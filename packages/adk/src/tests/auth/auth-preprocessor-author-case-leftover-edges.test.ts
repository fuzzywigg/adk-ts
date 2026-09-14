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

function eucUserResponse(author: string, id = "euc-1"): Event {
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
						}) as any,
					},
				},
			],
		},
	});
}

describe('auth-preprocessor author !== "user" case leftover (post #168)', () => {
	it.each([
		{ label: "User", author: "User" },
		{ label: "USER", author: "USER" },
		{ label: "user trailing space", author: "user " },
		{ label: "leading space user", author: " user" },
		{ label: "UsEr", author: "UsEr" },
	])("$label author skips EUC scan (strict !== user)", async ({ author }) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx([eucUserResponse(author)]),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("exact lowercase user still enters EUC response path", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const events = await collect(
			requestProcessor.runAsync(
				baseCtx([eucUserResponse("user")]),
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("non-user authors before a true user event are skipped until user", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const filler = eucUserResponse("USER", "euc-wrong");
		const real = eucUserResponse("user", "euc-real");
		await collect(
			requestProcessor.runAsync(baseCtx([filler, real]), new LlmRequest()),
		);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});
});
