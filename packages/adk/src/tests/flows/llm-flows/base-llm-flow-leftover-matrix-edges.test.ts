import type { BaseAgent, InvocationContext } from "@adk/agents";
import { Event } from "@adk/events";
import { EventActions } from "@adk/events/event-actions";
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

function makeCtx(overrides: Record<string, unknown> = {}): InvocationContext {
	return {
		invocationId: "inv-leftover",
		agent: { name: "leftover-agent" },
		branch: "main",
		...overrides,
	} as unknown as InvocationContext;
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
	const items: T[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

beforeEach(() => {
	handleFunctionCallsAsyncMock.mockReset();
	generateAuthEventMock.mockReset();
	populateClientFunctionCallIdMock.mockReset();
	getLongRunningFunctionCallsMock.mockReset();
	getLongRunningFunctionCallsMock.mockReturnValue(new Set());
});

describe("BaseLlmFlow leftover matrix coalesce/logging edges", () => {
	describe('logging || "none" / 0 / "unknown" request matrix', () => {
		it.each([
			{
				label: "empty contents + empty system + no tools",
				contents: [],
				system: "",
				tools: undefined,
				expectContentItems: 0,
				expectSystem: "none",
				expectTools: "none",
				expectToolCount: 0,
			},
			{
				label: "undefined contents length coalesce",
				contents: undefined,
				system: "",
				tools: [],
				expectContentItems: 0,
				expectSystem: "none",
				expectTools: "none",
				expectToolCount: 0,
			},
			{
				label:
					"whitespace-only system still logs as-is then || none if empty after truncate path",
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				system: "   ",
				tools: [{ function: { name: "t1" } }],
				expectContentItems: 1,
				expectSystem: "   ",
				expectTools: expect.any(String),
				expectToolCount: 1,
			},
		])("$label", async ({
			contents,
			system,
			tools,
			expectContentItems,
			expectSystem,
			expectTools,
			expectToolCount,
		}) => {
			const flow = new InspectableFlow();
			const agent = {
				name: "log-agent",
				canonicalModel: {
					model: "m",
					generateContentAsync: vi.fn(async function* () {
						yield { content: { parts: [{ text: "ok" }] } };
					}),
				},
			};
			const llmRequest = new LlmRequest();
			if (contents !== undefined) {
				(llmRequest as any).contents = contents;
			} else {
				delete (llmRequest as any).contents;
			}
			if (system) {
				llmRequest.config = {
					systemInstruction: system,
					labels: {},
					...(tools !== undefined ? { tools } : {}),
				} as any;
			} else {
				llmRequest.config = {
					labels: {},
					...(tools !== undefined ? { tools } : {}),
				} as any;
			}

			await collect(
				flow._callLlmAsync(
					makeCtx({ agent }),
					llmRequest,
					new Event({ id: "e1", author: "log-agent" }),
				),
			);

			const structured = (flow as any).logger.debugStructured.mock.calls.find(
				(c: unknown[]) => c[0] === "📤 LLM Request",
			);
			expect(structured).toBeTruthy();
			const payload = structured[1];
			expect(payload["Content Items"]).toBe(expectContentItems);
			expect(payload["System Instruction"]).toBe(expectSystem);
			expect(payload["Available Tools"]).toEqual(expectTools);
			expect(payload["Tool Count"]).toBe(expectToolCount);
		});
	});

	describe('logging || "unknown" / "none" response matrix', () => {
		it.each([
			{
				label: "missing usage + finish + error",
				response: { content: { parts: [{ text: "r" }] } },
				token: "unknown",
				finish: "unknown",
				error: "none",
			},
			{
				label: "falsy zero tokenCount coalesces to unknown; empty finish/error",
				response: {
					content: { parts: [{ text: "r" }] },
					usageMetadata: { totalTokenCount: 0 },
					finishReason: "",
					errorCode: "",
				},
				token: "unknown",
				finish: "unknown",
				error: "none",
			},
			{
				label: "populated metadata",
				response: {
					content: { parts: [{ text: "r" }] },
					usageMetadata: { totalTokenCount: 42 },
					finishReason: "STOP",
					errorCode: "E1",
				},
				token: 42,
				finish: "STOP",
				error: "E1",
			},
		])("$label", async ({ response, token, finish, error }) => {
			const flow = new InspectableFlow();
			const agent = {
				name: "resp-log",
				canonicalModel: {
					model: "m",
					generateContentAsync: vi.fn(async function* () {
						yield response;
					}),
				},
			};

			await collect(
				flow._callLlmAsync(
					makeCtx({ agent }),
					new LlmRequest(),
					new Event({ id: "e2", author: "resp-log" }),
				),
			);

			const structured = (flow as any).logger.debugStructured.mock.calls.find(
				(c: unknown[]) => c[0] === "📥 LLM Response",
			);
			expect(structured).toBeTruthy();
			expect(structured[1]["Token Count"]).toBe(token);
			expect(structured[1]["Finish Reason"]).toBe(finish);
			expect(structured[1].Error).toBe(error);
		});
	});

	describe("toolsDict || {} matrix", () => {
		it.each([
			{ toolsDict: undefined, expected: {} },
			{ toolsDict: null, expected: {} },
			{
				toolsDict: { echo: { name: "echo" } },
				expected: { echo: { name: "echo" } },
			},
		])("_postprocessHandleFunctionCallsAsync toolsDict=$toolsDict", async ({
			toolsDict,
			expected,
		}) => {
			const flow = new InspectableFlow();
			const llmRequest = new LlmRequest();
			if (toolsDict === undefined) {
				delete (llmRequest as any).toolsDict;
			} else {
				(llmRequest as any).toolsDict = toolsDict;
			}
			handleFunctionCallsAsyncMock.mockResolvedValue(null);

			await collect(
				flow._postprocessHandleFunctionCallsAsync(
					makeCtx(),
					new Event({ author: "agent" }),
					llmRequest,
				),
			);

			expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
				expect.anything(),
				expect.any(Event),
				expected,
			);
		});

		it.each([
			{ toolsDict: undefined },
			{ toolsDict: null },
			{ toolsDict: {} },
		])("_finalizeModelResponseEvent longRunning uses toolsDict=$toolsDict", ({
			toolsDict,
		}) => {
			const flow = new InspectableFlow();
			const llmRequest = new LlmRequest();
			if (toolsDict === undefined) {
				delete (llmRequest as any).toolsDict;
			} else {
				(llmRequest as any).toolsDict = toolsDict;
			}
			const llmResponse = {
				content: {
					role: "model",
					parts: [{ functionCall: { name: "f", args: {}, id: "1" } }],
				},
			} as LlmResponse;
			const modelEvent = new Event({ id: "me", author: "agent" });

			flow._finalizeModelResponseEvent(llmRequest, llmResponse, modelEvent);

			expect(getLongRunningFunctionCallsMock).toHaveBeenCalledWith(
				expect.any(Array),
				toolsDict || {},
			);
		});
	});

	describe("transfer missing throw matrix", () => {
		it.each([
			"missing-child",
			"ghost",
			"OtherAgent",
		])("throws when transfer target '%s' is absent", (agentName) => {
			const flow = new InspectableFlow();
			const rootAgent = {
				findAgent: vi.fn().mockReturnValue(undefined),
			};
			const ctx = makeCtx({
				agent: {
					name: "root",
					rootAgent,
				} as unknown as BaseAgent,
			});

			expect(() => (flow as any)._getAgentToRun(ctx, agentName)).toThrow(
				`Agent ${agentName} not found in the agent tree.`,
			);
			expect((flow as any).logger.error).toHaveBeenCalledWith(
				`Agent '${agentName}' not found in the agent tree.`,
			);
		});

		it("propagates missing transfer through function-response postprocess", async () => {
			const flow = new InspectableFlow();
			handleFunctionCallsAsyncMock.mockResolvedValue(
				new Event({
					author: "agent",
					actions: new EventActions({ transferToAgent: "nope" }),
				}),
			);
			const ctx = makeCtx({
				agent: {
					name: "root",
					rootAgent: { findAgent: () => undefined },
				},
			});

			await expect(
				collect(
					flow._postprocessHandleFunctionCallsAsync(
						ctx,
						new Event({ author: "agent" }),
						new LlmRequest(),
					),
				),
			).rejects.toThrow(/Agent nope not found/);
		});
	});

	describe("callback falsy fallthrough matrix", () => {
		it.each([
			{
				kind: "before",
				callbacks: [
					() => undefined,
					() => null,
					() => false,
					() => 0,
					() => "",
				],
			},
			{
				kind: "before",
				callbacks: [async () => undefined, async () => null],
			},
			{
				kind: "after",
				callbacks: [() => undefined, () => null, () => false],
			},
			{
				kind: "after",
				callbacks: [async () => undefined, async () => 0, async () => ""],
			},
		])("$kind falsy fallthrough ($callbacks.length callbacks)", async ({
			kind,
			callbacks,
		}) => {
			const flow = new InspectableFlow();
			const modelEvent = new Event({ id: "me", author: "agent" });
			if (kind === "before") {
				const result = await flow._handleBeforeModelCallback(
					makeCtx({
						agent: {
							name: "cb",
							canonicalBeforeModelCallbacks: callbacks,
						},
					}),
					new LlmRequest(),
					modelEvent,
				);
				expect(result).toBeUndefined();
			} else {
				const result = await flow._handleAfterModelCallback(
					makeCtx({
						agent: {
							name: "cb",
							canonicalAfterModelCallbacks: callbacks,
						},
					}),
					{
						content: { role: "model", parts: [{ text: "orig" }] },
					} as LlmResponse,
					modelEvent,
				);
				expect(result).toBeUndefined();
			}
		});

		it("yields original response when after-callback returns only falsy values", async () => {
			const flow = new InspectableFlow();
			const raw = { content: { parts: [{ text: "raw" }] } };
			const agent = {
				name: "after-falsy",
				canonicalAfterModelCallbacks: [() => undefined, async () => null],
				canonicalModel: {
					model: "m",
					generateContentAsync: vi.fn(async function* () {
						yield raw;
					}),
				},
			};

			const responses = await collect(
				flow._callLlmAsync(
					makeCtx({ agent }),
					new LlmRequest(),
					new Event({ id: "e3", author: "after-falsy" }),
				),
			);
			expect(responses).toEqual([raw]);
		});
	});

	describe("config / labels coalesce matrix", () => {
		it.each([
			{ config: undefined, labels: undefined },
			{ config: {}, labels: undefined },
			{ config: { labels: {} }, labels: {} },
			{ config: { labels: { custom: "x" } }, labels: { custom: "x" } },
		])("initializes config/labels for $config", async ({ config, labels }) => {
			const flow = new InspectableFlow();
			const agent = {
				name: "label-agent",
				canonicalModel: {
					model: "m",
					generateContentAsync: vi.fn(async function* () {
						yield { content: { parts: [{ text: "ok" }] } };
					}),
				},
			};
			const llmRequest = new LlmRequest();
			if (config === undefined) {
				delete (llmRequest as any).config;
			} else {
				llmRequest.config = {
					...config,
					labels: labels ? { ...labels } : undefined,
				} as any;
				if (labels === undefined && config) {
					delete (llmRequest.config as any).labels;
				}
			}

			await collect(
				flow._callLlmAsync(
					makeCtx({ agent }),
					llmRequest,
					new Event({ id: "e4", author: "label-agent" }),
				),
			);

			expect(llmRequest.config).toBeTruthy();
			expect(llmRequest.config?.labels?.adk_agent_name).toBe("label-agent");
			if (labels?.custom) {
				expect(llmRequest.config?.labels?.custom).toBe("x");
			}
		});
	});
});
