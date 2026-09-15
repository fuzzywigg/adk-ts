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
 * Fifteenth leftover deepen (HEAVY tip-relaunch residual after tip #269 /
 * 03ff90a8; supersedes closed #273/#262): after-callback pins string `"0"` /
 * `"false"` keep via `alteredLlmResponse || llmResponse`. Symmetric before-model
 * residual — `if (beforeModelCallbackContent)` also keeps those letter-words
 * and short-circuits `_callLlmAsync` without hitting the model.
 */
describe("base-llm-flow before-callback string-zero/false keep fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("_handleBeforeModelCallback returns truthy string $label", async ({
		value,
	}) => {
		const flow = new InspectableFlow();
		const result = await flow._handleBeforeModelCallback(
			makeCtx({
				agent: {
					name: "before-str",
					canonicalBeforeModelCallbacks: [() => value as any],
				},
			}),
			new LlmRequest(),
			new Event({ id: "me", author: "before-str" }),
		);
		expect(result).toBe(value);
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("_callLlmAsync yields string $label and skips model", async ({
		value,
	}) => {
		const flow = new InspectableFlow();
		const generateContentAsync = vi.fn(async function* () {
			yield { content: { parts: [{ text: "should-not-run" }] } };
		});
		const responses = await collect(
			flow._callLlmAsync(
				makeCtx({
					agent: {
						name: "before-str-yield",
						canonicalBeforeModelCallbacks: [() => value as any],
						canonicalModel: {
							model: "m",
							generateContentAsync,
						},
					},
				}),
				new LlmRequest(),
				new Event({ id: "e", author: "before-str-yield" }),
			),
		);
		expect(responses).toEqual([value]);
		expect(generateContentAsync).not.toHaveBeenCalled();
	});

	it("numeric 0 still falls through to model (prior control)", async () => {
		const flow = new InspectableFlow();
		const raw = { content: { parts: [{ text: "raw" }] } } as LlmResponse;
		const responses = await collect(
			flow._callLlmAsync(
				makeCtx({
					agent: {
						name: "before-num-zero",
						canonicalBeforeModelCallbacks: [() => 0 as any],
						canonicalModel: {
							model: "m",
							generateContentAsync: vi.fn(async function* () {
								yield raw;
							}),
						},
					},
				}),
				new LlmRequest(),
				new Event({ id: "e", author: "before-num-zero" }),
			),
		);
		expect(responses).toEqual([raw]);
	});
});
