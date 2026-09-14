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

function eucUserResponse(id: string, author: string): Event {
	return new Event({
		author,
		content: {
			role: "user",
			parts: [
				{
					functionResponse: {
						id,
						name: REQUEST_EUC_FUNCTION_CALL_NAME,
						response: { ok: true } as any,
					},
				},
			],
		},
	});
}

describe("auth-preprocessor author === user case sensitivity fifth leftover", () => {
	it.each([
		{ label: "User", author: "User" },
		{ label: "USER", author: "USER" },
		{ label: "uSer", author: "uSer" },
		{ label: " user", author: " user" },
		{ label: "user ", author: "user " },
	])('$label author is not treated as user (strict !== "user")', async ({
		author,
	}) => {
		const ctx = baseCtx([eucUserResponse("fr-1", author)]);
		const items = await collect(
			requestProcessor.runAsync(ctx, new LlmRequest()),
		);
		expect(items).toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it("exact lowercase user still enters EUC scan path", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const ctx = baseCtx([eucUserResponse("fr-user", "user")]);
		await collect(requestProcessor.runAsync(ctx, new LlmRequest()));
		warn.mockRestore();
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});
});
