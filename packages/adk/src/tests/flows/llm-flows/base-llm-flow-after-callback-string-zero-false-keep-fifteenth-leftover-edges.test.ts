import type { InvocationContext } from "@adk/agents";
import { Event } from "@adk/events";
import { SingleFlow } from "@adk/flows";
import type { LlmResponse } from "@adk/models";
import { LlmRequest } from "@adk/models";
import { beforeEach, describe, expect, it, vi } from "vitest";

const handleFunctionCallsAsyncMock = vi.hoisted(() => vi.fn());
const generateAuthEventMock = vi.hoisted(() => vi.fn());
const populateClientFunctionCallIdMock = vi.hoisted(() => vi.fn());
const getLongRunningFunctionCallsMock = vi.hoisted(() => vi.fn());

vi.mock("@adk/helpers/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debugArray: vi.fn(),
		debugStructured: vi.fn(),
	})),
}));

vi.mock("@adk/flows/llm-flows/functions", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@adk/flows/llm-flows/functions")>();
	return {
		...actual,
		handleFunctionCallsAsync: handleFunctionCallsAsyncMock,
		generateAuthEvent: generateAuthEventMock,
		populateClientFunctionCallId: populateClientFunctionCallIdMock,
		getLongRunningFunctionCalls: getLongRunningFunctionCallsMock,
	};
});

class InspectableFlow extends SingleFlow {}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeCtx(overrides: Record<string, unknown> = {}): InvocationContext {
	return {
		invocationId: "inv",
		branch: "main",
		session: { state: {}, events: [] },
		runConfig: {},
		incrementLlmCallCount: vi.fn(),
		...overrides,
	} as unknown as InvocationContext;
}

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
	generateAuthEventMock.mockReset();
	populateClientFunctionCallIdMock.mockReset();
	getLongRunningFunctionCallsMock.mockReset();
	getLongRunningFunctionCallsMock.mockReturnValue(new Set());
});

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #269 / 03ff90a8 after providers; supersedes closed #273/#262): prior leftovers pin classic falsy after-model callbacks
 * falling through (`alteredLlmResponse || llmResponse` → original). String
 * `"0"` / `"false"` are truthy so `_handleAfterModelCallback` returns them and
 * `_callLlmAsync` yields the string instead of the raw response.
 */
describe("base-llm-flow after-callback string-zero/false keep fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("_handleAfterModelCallback returns truthy string $label", async ({
		value,
	}) => {
		const flow = new InspectableFlow();
		const result = await flow._handleAfterModelCallback(
			makeCtx({
				agent: {
					name: "after-str",
					canonicalAfterModelCallbacks: [() => value as any],
				},
			}),
			{ content: { role: "model", parts: [{ text: "orig" }] } } as LlmResponse,
			new Event({ id: "me", author: "after-str" }),
		);
		expect(result).toBe(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("_callLlmAsync yields string $label via altered || llmResponse", async ({
		value,
	}) => {
		const flow = new InspectableFlow();
		const raw = { content: { parts: [{ text: "raw" }] } };
		const responses = await collect(
			flow._callLlmAsync(
				makeCtx({
					agent: {
						name: "after-str-yield",
						canonicalAfterModelCallbacks: [() => value as any],
						canonicalModel: {
							model: "m",
							generateContentAsync: vi.fn(async function* () {
								yield raw;
							}),
						},
					},
				}),
				new LlmRequest(),
				new Event({ id: "e", author: "after-str-yield" }),
			),
		);
		expect(responses).toEqual([value]);
	});

	it("numeric 0 still falls through to original (prior control)", async () => {
		const flow = new InspectableFlow();
		const raw = { content: { parts: [{ text: "raw" }] } };
		const responses = await collect(
			flow._callLlmAsync(
				makeCtx({
					agent: {
						name: "after-num-zero",
						canonicalAfterModelCallbacks: [() => 0 as any],
						canonicalModel: {
							model: "m",
							generateContentAsync: vi.fn(async function* () {
								yield raw;
							}),
						},
					},
				}),
				new LlmRequest(),
				new Event({ id: "e", author: "after-num-zero" }),
			),
		);
		expect(responses).toEqual([raw]);
	});
});
