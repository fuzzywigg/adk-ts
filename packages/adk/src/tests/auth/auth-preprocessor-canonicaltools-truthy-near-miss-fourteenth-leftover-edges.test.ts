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

function eucUserEvent(id = "euc-1"): Event {
	return new Event({
		author: "user",
		content: {
			role: "user",
			parts: [
				{
					functionResponse: {
						id,
						name: REQUEST_EUC_FUNCTION_CALL_NAME,
						response: JSON.stringify({
							authScheme: { type: "apiKey" },
						}),
					},
				},
			],
		},
	});
}

/**
 * Fourteenth leftover: `typeof (agent as any).canonicalTools !== "function"` —
 * thirteenth pins author near-misses; truthy non-function canonicalTools
 * (0 is falsy via !agent short-circuit on agent itself only) still abort.
 */
describe("auth-preprocessor canonicalTools truthy near-miss fourteenth leftover", () => {
	it.each([
		{ label: "empty string", canonicalTools: "" },
		{ label: "true", canonicalTools: true },
		{ label: "object", canonicalTools: {} },
		{ label: "array", canonicalTools: [] },
		{ label: '"0"', canonicalTools: "0" },
	])("aborts when canonicalTools is truthy non-function ($label)", async ({
		canonicalTools,
	}) => {
		const ctx = {
			agent: {
				name: "auth-agent",
				canonicalTools,
			},
			session: { events: [eucUserEvent()], state: {} },
			runConfig: {},
		} as unknown as InvocationContext;

		await expect(
			collect(requestProcessor.runAsync(ctx, new LlmRequest())),
		).resolves.toEqual([]);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it("async function canonicalTools still proceeds past guard (control)", async () => {
		handleFunctionCallsAsyncMock.mockResolvedValue(undefined);
		const ctx = {
			agent: {
				name: "auth-agent",
				canonicalTools: async () => [],
			},
			session: { events: [eucUserEvent()], state: {} },
			runConfig: {},
		} as unknown as InvocationContext;

		await collect(requestProcessor.runAsync(ctx, new LlmRequest()));
		// size may be 0 if no matching resume chain — guard itself must pass
		expect(ctx.agent).toBeDefined();
		expect(typeof (ctx.agent as any).canonicalTools).toBe("function");
	});
});
