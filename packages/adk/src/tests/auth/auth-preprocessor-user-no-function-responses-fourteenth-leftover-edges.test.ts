import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { requestProcessor } from "../../auth/auth-preprocessor";
import { Event } from "../../events/event";
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

/**
 * Fourteenth leftover: first user event with `!responses || responses.length
 * === 0` does a hard `return` (not continue). Distinct from thirteenth author
 * near-miss continue and eleventh EUC name case.
 */
describe("auth-preprocessor user no functionResponses fourteenth leftover", () => {
	it("text-only user event aborts processor (hard return)", async () => {
		const textOnly = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [{ text: "hello" }],
			},
		});
		const olderEuc = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-old",
							name: "adk_request_credential",
							response: "{}",
						},
					},
				],
			},
		});

		const ctx = {
			agent: {
				name: "auth-agent",
				canonicalTools: async () => [{ name: "secure_api" }],
			},
			session: {
				events: [olderEuc, textOnly],
				state: {},
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await expect(
			collect(requestProcessor.runAsync(ctx, new LlmRequest())),
		).resolves.toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it("empty parts array on user event also hard-returns", async () => {
		const emptyParts = new Event({
			author: "user",
			content: { role: "user", parts: [] },
		});
		const ctx = {
			agent: {
				name: "auth-agent",
				canonicalTools: async () => [],
			},
			session: { events: [emptyParts], state: {} },
			runConfig: {},
		} as unknown as InvocationContext;

		await expect(
			collect(requestProcessor.runAsync(ctx, new LlmRequest())),
		).resolves.toEqual([]);
	});
});
