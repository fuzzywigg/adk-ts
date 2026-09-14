import type { BaseAgent, InvocationContext } from "@adk/agents";
import { StreamingMode } from "@adk/agents/run-config";
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
		invocationId: "inv-leftover",
		agent: { name: "agent" } as BaseAgent,
		branch: "main",
		endInvocation: false,
		incrementLlmCallCount: vi.fn(),
		session: { events: [], id: "s1", appName: "app", userId: "u1", state: {} },
		...overrides,
	} as InvocationContext;
}

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
	generateAuthEventMock.mockReset();
	populateClientFunctionCallIdMock.mockReset();
	getLongRunningFunctionCallsMock.mockReset();
	getLongRunningFunctionCallsMock.mockReturnValue(new Set());
});

describe("BaseLlmFlow finalize/postprocess leftover matrix (post #141)", () => {
	it.each([
		{
			label: "turnComplete only",
			response: { turnComplete: true } as LlmResponse,
		},
		{
			label: "interrupted only",
			response: { interrupted: true } as LlmResponse,
		},
		{
			label: "errorCode only",
			response: { errorCode: "X", errorMessage: "boom" } as LlmResponse,
		},
		{
			label: "content with text",
			response: {
				content: { role: "model", parts: [{ text: "hi" }] },
			} as LlmResponse,
		},
	])("_postprocessLive yields finalized event for $label", async ({
		response,
	}) => {
		const flow = new InspectableFlow();
		const events = await collect(
			flow._postprocessLive(
				makeCtx(),
				new LlmRequest(),
				response,
				new Event({ id: "me", author: "agent" }),
			),
		);
		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0].author).toBe("agent");
	});

	it("_postprocessLive skips when no content/error/interrupt/turnComplete", async () => {
		const flow = new InspectableFlow();
		const events = await collect(
			flow._postprocessLive(
				makeCtx(),
				new LlmRequest(),
				{} as LlmResponse,
				new Event({ id: "me", author: "agent" }),
			),
		);
		expect(events).toEqual([]);
	});

	it("_postprocessAsync skips empty responses without content/error/interrupt", async () => {
		const flow = new InspectableFlow();
		const events = await collect(
			flow._postprocessAsync(
				makeCtx(),
				new LlmRequest(),
				{} as LlmResponse,
				new Event({ id: "me", author: "agent" }),
			),
		);
		expect(events).toEqual([]);
	});

	it("truncates long function-call args in debugArray during postprocess", async () => {
		const flow = new InspectableFlow();
		const longArgs = { blob: "x".repeat(200) };
		handleFunctionCallsAsyncMock.mockResolvedValue(null);
		const modelEvent = new Event({
			id: "me",
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							id: "c1",
							name: "tool",
							args: longArgs,
						},
					},
				],
			},
		});

		await collect(
			flow._postprocessAsync(
				makeCtx(),
				new LlmRequest(),
				{
					content: modelEvent.content,
				} as LlmResponse,
				modelEvent,
			),
		);

		expect((flow as any).logger.debugArray).toHaveBeenCalledWith(
			"🔧 Function Calls",
			expect.arrayContaining([
				expect.objectContaining({
					Name: "tool",
					Arguments: expect.stringMatching(/\.\.\.$/),
					ID: "c1",
				}),
			]),
		);
	});

	it("uses auto ID and untruncated args when args JSON is short", async () => {
		const flow = new InspectableFlow();
		handleFunctionCallsAsyncMock.mockResolvedValue(null);
		const modelEvent = new Event({
			id: "me",
			author: "agent",
			content: {
				role: "model",
				parts: [
					{
						functionCall: {
							name: "short",
							args: { a: 1 },
						},
					},
				],
			},
		});

		await collect(
			flow._postprocessAsync(
				makeCtx(),
				new LlmRequest(),
				{ content: modelEvent.content } as LlmResponse,
				modelEvent,
			),
		);

		expect((flow as any).logger.debugArray).toHaveBeenCalledWith(
			"🔧 Function Calls",
			[
				expect.objectContaining({
					Name: "short",
					Arguments: JSON.stringify({ a: 1 }),
					ID: "auto",
				}),
			],
		);
	});

	it("_postprocessLive transfer prefers runLive then falls back to runAsync", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const liveEvent = new Event({
			author: "child",
			content: { role: "model", parts: [{ text: "live" }] },
		});
		const asyncEvent = new Event({
			author: "child",
			content: { role: "model", parts: [{ text: "async" }] },
		});

		const childWithLive = {
			name: "child",
			runLive: vi.fn(async function* () {
				yield liveEvent;
			}),
			runAsync: vi.fn(async function* () {
				yield asyncEvent;
			}),
		};
		const root = {
			name: "root",
			findAgent: vi.fn(() => childWithLive),
		};

		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({
				author: "agent",
				actions: { transferToAgent: "child" } as any,
				content: {
					role: "user",
					parts: [{ functionResponse: { id: "1", name: "t", response: {} } }],
				},
			}),
		);

		const callEvent = new Event({
			id: "me",
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "1", name: "t", args: {} } }],
			},
		});

		const withLive = await collect(
			flow._postprocessLive(
				makeCtx({ agent: { name: "agent", rootAgent: root } }),
				new LlmRequest(),
				{ content: callEvent.content } as LlmResponse,
				callEvent,
			),
		);
		expect(withLive.some((e) => e.content?.parts?.[0]?.text === "live")).toBe(
			true,
		);
		expect(childWithLive.runLive).toHaveBeenCalled();

		const childAsyncOnly = {
			name: "child",
			runAsync: vi.fn(async function* () {
				yield asyncEvent;
			}),
		};
		root.findAgent = vi.fn(() => childAsyncOnly);

		const withAsync = await collect(
			flow._postprocessLive(
				makeCtx({ agent: { name: "agent", rootAgent: root } }),
				new LlmRequest(),
				{ content: callEvent.content } as LlmResponse,
				callEvent,
			),
		);
		expect(withAsync.some((e) => e.content?.parts?.[0]?.text === "async")).toBe(
			true,
		);
		expect(childAsyncOnly.runAsync).toHaveBeenCalled();
	});

	it("_postprocessLive throws when transfer target agent is missing", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({
				author: "agent",
				actions: { transferToAgent: "missing" } as any,
				content: {
					role: "user",
					parts: [{ functionResponse: { id: "1", name: "t", response: {} } }],
				},
			}),
		);
		const callEvent = new Event({
			id: "me",
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "1", name: "t", args: {} } }],
			},
		});
		const root = {
			name: "root",
			findAgent: vi.fn(() => null),
		};

		await expect(
			collect(
				flow._postprocessLive(
					makeCtx({ agent: { name: "agent", rootAgent: root } }),
					new LlmRequest(),
					{ content: callEvent.content } as LlmResponse,
					callEvent,
				),
			),
		).rejects.toThrow();
	});

	it("_callLlmAsync sets isStreaming for SSE and truncates long system instruction", async () => {
		const flow = new InspectableFlow();
		const generateContentAsync = vi.fn(async function* () {
			yield {
				content: { role: "model", parts: [{ text: "ok" }] },
			} as LlmResponse;
		});
		const agent = {
			name: "agent",
			canonicalModel: {
				model: "fake-model",
				generateContentAsync,
			},
		};
		const llmRequest = new LlmRequest();
		llmRequest.appendInstructions(["x".repeat(120)]);

		const responses = await collect(
			flow._callLlmAsync(
				makeCtx({
					agent,
					runConfig: { streamingMode: StreamingMode.SSE },
				}),
				llmRequest,
				new Event({ id: "me", author: "agent" }),
			),
		);
		expect(responses).toHaveLength(1);
		expect(generateContentAsync).toHaveBeenCalledWith(
			expect.any(LlmRequest),
			true,
		);
		expect((flow as any).logger.debugStructured).toHaveBeenCalledWith(
			"📤 LLM Request",
			expect.objectContaining({
				"System Instruction": expect.stringMatching(/\.\.\.$/),
				Streaming: "Yes",
			}),
		);
	});

	it("_handleAfterModelCallback returns first truthy among mixed sync/async", async () => {
		const flow = new InspectableFlow();
		const result = await flow._handleAfterModelCallback(
			makeCtx({
				agent: {
					name: "agent",
					canonicalAfterModelCallbacks: [
						() => undefined,
						async () => null,
						async () =>
							({
								content: { role: "model", parts: [{ text: "after" }] },
							}) as LlmResponse,
					],
				},
			}),
			{ content: { role: "model", parts: [{ text: "orig" }] } } as LlmResponse,
			new Event({ id: "me", author: "agent" }),
		);
		expect(result?.content?.parts?.[0]).toEqual({ text: "after" });
	});

	it("_preprocessAsync stops model when endInvocation flips mid-processors", async () => {
		const flow = new InspectableFlow();
		const ctx = makeCtx();
		flow.requestProcessors = [
			{
				runAsync: async function* () {
					(ctx as any).endInvocation = true;
					yield new Event({
						author: "proc",
						content: { role: "model", parts: [{ text: "stop" }] },
					});
				},
			},
		];
		(ctx as any).agent = {
			name: "agent",
			canonicalTools: async () => [],
		};

		const events = await collect(flow._runOneStepAsync(ctx));
		expect(events).toHaveLength(1);
		expect(events[0].content?.parts?.[0]?.text).toBe("stop");
	});

	it("_finalizeModelResponseEvent populates longRunningToolIds from helper", () => {
		const flow = new InspectableFlow();
		getLongRunningFunctionCallsMock.mockReturnValue(new Set(["c1"]));
		const llmRequest = new LlmRequest();
		(llmRequest as any).toolsDict = { tool: {} };
		const modelEvent = new Event({
			id: "me",
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { id: "c1", name: "tool", args: {} } }],
			},
		});
		const finalized = flow._finalizeModelResponseEvent(
			llmRequest,
			{ content: modelEvent.content } as LlmResponse,
			modelEvent,
		);
		expect(populateClientFunctionCallIdMock).toHaveBeenCalled();
		expect(finalized.longRunningToolIds).toEqual(new Set(["c1"]));
	});
});
