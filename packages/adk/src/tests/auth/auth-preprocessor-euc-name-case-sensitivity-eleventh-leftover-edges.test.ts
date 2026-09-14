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

function eucResponse(name: string, id: string): Event {
	return new Event({
		author: "user",
		content: {
			role: "user",
			parts: [
				{
					functionResponse: {
						id,
						name,
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

/**
 * Eleventh leftover: functionResponse.name !== REQUEST_EUC_FUNCTION_CALL_NAME
 * is case-sensitive — author/temp/scheme leftovers burned; response name case
 * was not. Distinct from #178 oauth2 refresh-result.
 */
describe("auth-preprocessor euc name case-sensitivity eleventh leftover edges", () => {
	it.each([
		"ADK_REQUEST_CREDENTIAL",
		"Adk_Request_Credential",
		"adk_Request_credential",
		"adk_request_credential ",
		" adk_request_credential",
	])("name %j !== exact EUC constant skips resume", async (name) => {
		await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [eucResponse(name, `euc-${name.trim()}`)],
				}),
				new LlmRequest(),
			),
		);
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
	});

	it(`exact ${JSON.stringify(REQUEST_EUC_FUNCTION_CALL_NAME)} enters EUC path`, async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [eucResponse(REQUEST_EUC_FUNCTION_CALL_NAME, "euc-ok")],
				}),
				new LlmRequest(),
			),
		);
		// No matching function call to resume → still no handleFunctionCalls
		expect(handleFunctionCallsAsyncMock).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("case-mismatched name does not prevent later exact EUC name in same event", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		handleFunctionCallsAsyncMock.mockResolvedValue(null);

		const mixed = new Event({
			author: "user",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "wrong",
							name: "ADK_REQUEST_CREDENTIAL",
							response: "{}",
						},
					},
					{
						functionResponse: {
							id: "right",
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

		const original = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "orig",
							name: "needs_auth",
							args: {},
						},
					},
				],
			},
		});

		const eucCall = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "right",
							name: REQUEST_EUC_FUNCTION_CALL_NAME,
							args: JSON.stringify({
								function_call_id: "orig",
								auth_config: {},
							}),
						},
					},
				],
			},
		});

		await collect(
			requestProcessor.runAsync(
				baseCtx({
					events: [original, eucCall, mixed],
				}),
				new LlmRequest(),
			),
		);

		expect(handleFunctionCallsAsyncMock).toHaveBeenCalled();
		warn.mockRestore();
	});
});
