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

/**
 * Fourteenth leftover: `requestEucFunctionCallIds.has(functionCall.id)` —
 * Set membership is SameValueZero; number `1` ≠ string `"1"`. Thirteenth
 * pins empty/whitespace validate ids, not resume Set type mismatch.
 */
describe("auth-preprocessor EUC id number/string Set fourteenth leftover", () => {
	it("number response id vs string system call id → no resume", async () => {
		const userEvent = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: 1 as any,
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
							}),
						},
					},
				],
			},
		});
		const systemEuc = new Event({
			author: "model",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "orig-1" }),
						},
					},
				],
			},
		});
		const original = new Event({
			author: "model",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "orig-1",
							name: "secure_api",
							args: "{}",
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
				events: [original, systemEuc, userEvent],
				state: {},
			},
			runConfig: {},
		} as unknown as InvocationContext;

		await expect(
			collect(requestProcessor.runAsync(ctx, new LlmRequest())),
		).resolves.toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it("matching string ids still resume (control)", async () => {
		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({ author: "model", content: { role: "model", parts: [] } }),
		);
		const userEvent = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							response: JSON.stringify({
								authScheme: { type: "apiKey" },
							}),
						},
					},
				],
			},
		});
		const systemEuc = new Event({
			author: "model",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "euc-1",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({ function_call_id: "orig-1" }),
						},
					},
				],
			},
		});
		const original = new Event({
			author: "model",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "orig-1",
							name: "secure_api",
							args: "{}",
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
				events: [original, systemEuc, userEvent],
				state: {},
			},
			runConfig: {},
		} as unknown as InvocationContext;

		const items = await collect(
			requestProcessor.runAsync(ctx, new LlmRequest()),
		);
		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		expect(items).toHaveLength(1);
	});
});
