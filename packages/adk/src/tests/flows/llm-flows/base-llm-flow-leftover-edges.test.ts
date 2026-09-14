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

class TestLlmFlow extends SingleFlow {
	public _runOneStepAsync = vi.fn();
}

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

describe("base-llm-flow leftover: partial lastEvent throw", () => {
	const partialMatrix: Array<{
		label: string;
		partial: boolean;
		isFinal: boolean;
		expectThrow: boolean;
	}> = [
		{
			label: "partial non-final throws",
			partial: true,
			isFinal: false,
			expectThrow: true,
		},
		{
			label: "non-partial non-final continues then final",
			partial: false,
			isFinal: false,
			expectThrow: false,
		},
		{
			label: "partial final does not reach throw (breaks on final)",
			partial: true,
			isFinal: true,
			expectThrow: false,
		},
	];

	for (const { label, partial, isFinal, expectThrow } of partialMatrix) {
		it(label, async () => {
			const flow = new TestLlmFlow();
			const first = new Event({ author: "agent", partial });
			vi.spyOn(first, "isFinalResponse").mockReturnValue(isFinal);

			if (expectThrow) {
				flow._runOneStepAsync.mockImplementation(async function* () {
					yield first;
				});
				const generator = flow.runAsync(makeCtx({ agent: { name: "a" } }));
				await generator.next();
				await expect(generator.next()).rejects.toThrow(
					"Last event shouldn't be partial. LLM max output limit may be reached.",
				);
				return;
			}

			if (!isFinal) {
				const finalEvent = new Event({ author: "agent" });
				vi.spyOn(finalEvent, "isFinalResponse").mockReturnValue(true);
				flow._runOneStepAsync
					.mockImplementationOnce(async function* () {
						yield first;
					})
					.mockImplementationOnce(async function* () {
						yield finalEvent;
					});
			} else {
				flow._runOneStepAsync.mockImplementation(async function* () {
					yield first;
				});
			}

			const events = await collect(
				flow.runAsync(makeCtx({ agent: { name: "a" } })),
			);
			expect(events.length).toBeGreaterThanOrEqual(1);
		});
	}
});

describe("base-llm-flow leftover: nameless tool skip in preprocess dedup", () => {
	const namelessShapes: Array<{
		label: string;
		tool: Record<string, unknown>;
		shouldProcess: boolean;
	}> = [
		{
			label: "missing name among named peers",
			tool: {
				description: "no-name",
				processLlmRequest: vi.fn(async () => undefined),
			},
			shouldProcess: false,
		},
		{
			label: "empty string name skipped",
			tool: {
				name: "",
				description: "empty",
				processLlmRequest: vi.fn(async () => undefined),
			},
			shouldProcess: false,
		},
		{
			label: "null name skipped",
			tool: {
				name: null,
				description: "null-name",
				processLlmRequest: vi.fn(async () => undefined),
			},
			shouldProcess: false,
		},
		{
			label: "undefined name skipped",
			tool: {
				name: undefined,
				description: "undef",
				processLlmRequest: vi.fn(async () => undefined),
			},
			shouldProcess: false,
		},
		{
			label: "valid name processed",
			tool: {
				name: "keeper",
				description: "keep",
				isLongRunning: false,
				processLlmRequest: vi.fn(async () => undefined),
			},
			shouldProcess: true,
		},
	];

	for (const { label, tool, shouldProcess } of namelessShapes) {
		it(`dedup filter: ${label}`, async () => {
			const flow = new InspectableFlow();
			flow.requestProcessors = [];
			const named = {
				name: "alpha",
				description: "a",
				isLongRunning: false,
				processLlmRequest: vi.fn(async () => undefined),
			};
			const agent = {
				name: "tool-agent",
				canonicalTools: async () => [named, tool, { ...named, name: "beta" }],
			};
			await collect(
				flow._preprocessAsync(makeCtx({ agent }), new LlmRequest()),
			);
			expect(named.processLlmRequest).toHaveBeenCalled();
			if (shouldProcess) {
				expect(
					tool.processLlmRequest as ReturnType<typeof vi.fn>,
				).toHaveBeenCalled();
			} else {
				expect(
					tool.processLlmRequest as ReturnType<typeof vi.fn>,
				).not.toHaveBeenCalled();
			}
		});
	}

	it("single nameless tool alone skips dedup branch but still processes", async () => {
		const flow = new InspectableFlow();
		flow.requestProcessors = [];
		const nameless = {
			description: "solo-unnamed",
			processLlmRequest: vi.fn(async () => undefined),
		};
		const agent = {
			name: "solo",
			canonicalTools: async () => [nameless],
		};
		await collect(flow._preprocessAsync(makeCtx({ agent }), new LlmRequest()));
		expect(nameless.processLlmRequest).toHaveBeenCalledTimes(1);
	});
});

describe("base-llm-flow leftover: runLive?. || runAsync fallback", () => {
	it("prefers runLive when present on transfer target", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const liveEvt = new Event({ author: "child", id: "live" });
		const child = {
			name: "child",
			runLive: vi.fn(async function* () {
				yield liveEvt;
			}),
			runAsync: vi.fn(async function* () {
				yield new Event({ author: "async-child" });
			}),
		};
		const root = { name: "root", findAgent: vi.fn(() => child) };
		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({
				author: "root",
				actions: new EventActions({ transferToAgent: "child" }),
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								name: "transfer",
								id: "t1",
								response: {},
							},
						},
					],
				},
			}),
		);

		const events = await collect(
			flow._postprocessLive(
				makeCtx({
					agent: { name: "root", rootAgent: root } as BaseAgent,
				}),
				new LlmRequest(),
				{
					content: {
						role: "model",
						parts: [{ functionCall: { name: "transfer", id: "t1", args: {} } }],
					},
				} as LlmResponse,
				new Event({ id: "m1", author: "root", invocationId: "inv" }),
			),
		);

		expect(child.runLive).toHaveBeenCalled();
		expect(child.runAsync).not.toHaveBeenCalled();
		expect(events.some((e) => e.author === "child")).toBe(true);
	});

	it("falls back to runAsync when runLive is undefined", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const asyncEvt = new Event({ author: "child-async", id: "async" });
		const child = {
			name: "child",
			runAsync: vi.fn(async function* () {
				yield asyncEvt;
			}),
		};
		const root = { name: "root", findAgent: vi.fn(() => child) };
		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({
				author: "root",
				actions: new EventActions({ transferToAgent: "child" }),
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								name: "transfer",
								id: "t1",
								response: {},
							},
						},
					],
				},
			}),
		);

		const events = await collect(
			flow._postprocessLive(
				makeCtx({
					agent: { name: "root", rootAgent: root } as BaseAgent,
				}),
				new LlmRequest(),
				{
					content: {
						role: "model",
						parts: [{ functionCall: { name: "transfer", id: "t1", args: {} } }],
					},
				} as LlmResponse,
				new Event({ id: "m1", author: "root", invocationId: "inv" }),
			),
		);

		expect(child.runAsync).toHaveBeenCalled();
		expect(events.some((e) => e.author === "child-async")).toBe(true);
	});

	it("falls back when runLive is nullish via optional chain", async () => {
		const flow = new InspectableFlow();
		flow.responseProcessors = [];
		const asyncEvt = new Event({ author: "fallback", id: "fb" });
		const child = {
			name: "child",
			runLive: undefined,
			runAsync: vi.fn(async function* () {
				yield asyncEvt;
			}),
		};
		const root = { name: "root", findAgent: vi.fn(() => child) };
		handleFunctionCallsAsyncMock.mockResolvedValue(
			new Event({
				author: "root",
				actions: new EventActions({ transferToAgent: "child" }),
				content: {
					role: "user",
					parts: [
						{
							functionResponse: {
								name: "transfer",
								id: "t1",
								response: {},
							},
						},
					],
				},
			}),
		);

		const events = await collect(
			flow._postprocessLive(
				makeCtx({
					agent: { name: "root", rootAgent: root } as BaseAgent,
				}),
				new LlmRequest(),
				{
					content: {
						role: "model",
						parts: [{ functionCall: { name: "transfer", id: "t1", args: {} } }],
					},
				} as LlmResponse,
				new Event({ id: "m1", author: "root", invocationId: "inv" }),
			),
		);
		expect(events.map((e) => e.author)).toContain("fallback");
	});
});

describe("base-llm-flow leftover: toolsDict || {} coalesce", () => {
	const sites: Array<{
		label: string;
		run: (flow: InspectableFlow, llmRequest: LlmRequest) => Promise<unknown[]>;
	}> = [
		{
			label: "_postprocessHandleFunctionCallsAsync",
			run: async (flow, llmRequest) =>
				collect(
					flow._postprocessHandleFunctionCallsAsync(
						makeCtx({ agent: { name: "a" } }),
						new Event({ author: "a" }),
						llmRequest,
					),
				),
		},
		{
			label: "_finalizeModelResponseEvent",
			run: async (flow, llmRequest) => {
				const event = flow._finalizeModelResponseEvent(
					llmRequest,
					{
						content: {
							role: "model",
							parts: [{ functionCall: { name: "echo", id: "1", args: {} } }],
						},
					} as LlmResponse,
					new Event({ id: "m", author: "a", invocationId: "inv" }),
				);
				return [event];
			},
		},
		{
			label: "_postprocessLive function path",
			run: async (flow, llmRequest) => {
				handleFunctionCallsAsyncMock.mockResolvedValue(null);
				return collect(
					flow._postprocessLive(
						makeCtx({ agent: { name: "a" } }),
						llmRequest,
						{
							content: {
								role: "model",
								parts: [{ functionCall: { name: "echo", id: "1", args: {} } }],
							},
						} as LlmResponse,
						new Event({ id: "m", author: "a", invocationId: "inv" }),
					),
				);
			},
		},
	];

	for (const { label, run } of sites) {
		it(`${label} defaults missing toolsDict to {}`, async () => {
			const flow = new InspectableFlow();
			flow.responseProcessors = [];
			const llmRequest = new LlmRequest();
			delete (llmRequest as any).toolsDict;
			handleFunctionCallsAsyncMock.mockResolvedValue(null);

			await run(flow, llmRequest);

			if (label.includes("finalize")) {
				expect(getLongRunningFunctionCallsMock).toHaveBeenCalledWith(
					expect.any(Array),
					{},
				);
			} else {
				expect(handleFunctionCallsAsyncMock).toHaveBeenCalledWith(
					expect.anything(),
					expect.any(Event),
					{},
				);
			}
		});
	}
});

describe("base-llm-flow leftover: secondary tool dedup mystery shapes", () => {
	const mysteryMatrix: Array<{
		label: string;
		tools: unknown[];
		assert: (tools: any[]) => void;
	}> = [
		{
			label: "keeps mystery objects without name",
			tools: [{ mystery: true }, { weird: 1 }, null],
			assert: (tools) => {
				expect(tools.some((t) => t?.mystery)).toBe(true);
				expect(tools.some((t) => t?.weird === 1)).toBe(true);
			},
		},
		{
			label: "dedups duplicate functionDeclarations by name",
			tools: [
				{
					functionDeclarations: [
						{ name: "dup" },
						{ name: "dup" },
						{ name: "uniq" },
						{ name: "" },
						{},
					],
				},
			],
			assert: (tools) => {
				const fds = tools.find(
					(t) => t?.functionDeclarations,
				)?.functionDeclarations;
				expect(fds?.filter((f: any) => f?.name === "dup")).toHaveLength(1);
				expect(fds?.some((f: any) => f?.name === "uniq")).toBe(true);
			},
		},
		{
			label: "dedups named tools across entries",
			tools: [
				{ name: "shared" },
				{ name: "shared" },
				{ name: "other" },
				{ mystery: true },
			],
			assert: (tools) => {
				expect(tools.filter((t) => t?.name === "shared")).toHaveLength(1);
				expect(tools.some((t) => t?.name === "other")).toBe(true);
				expect(tools.some((t) => t?.mystery)).toBe(true);
			},
		},
		{
			label: "drops functionDeclarations tool when all fds filtered empty",
			tools: [
				{
					functionDeclarations: [{ name: "x" }, { name: "x" }],
				},
				{ name: "x" },
			],
			assert: (tools) => {
				expect(tools.some((t) => t?.name === "x")).toBe(true);
			},
		},
		{
			label: "empty tools array skips dedup block",
			tools: [],
			assert: (tools) => {
				expect(tools).toEqual([]);
			},
		},
	];

	for (const { label, tools, assert } of mysteryMatrix) {
		it(label, async () => {
			const flow = new InspectableFlow();
			const agent = {
				name: "dedup-agent",
				canonicalModel: {
					model: "fake",
					generateContentAsync: vi.fn(async function* () {
						yield { content: { parts: [{ text: "ok" }] } };
					}),
				},
			};
			const llmRequest = new LlmRequest();
			llmRequest.config = { tools: tools as any };
			await collect(
				flow._callLlmAsync(
					makeCtx({ agent }),
					llmRequest,
					new Event({ id: "m", author: "dedup-agent" }),
				),
			);
			assert((llmRequest.config?.tools as any[]) || []);
		});
	}
});

describe("base-llm-flow leftover: config || {} and labels || {}", () => {
	const configMatrix: Array<{
		label: string;
		setup: (req: LlmRequest) => void;
		expectedAgentLabel: string;
	}> = [
		{
			label: "missing config coalesces to {}",
			setup: (req) => {
				delete (req as any).config;
			},
			expectedAgentLabel: "label-agent",
		},
		{
			label: "config present but labels missing",
			setup: (req) => {
				req.config = {} as any;
			},
			expectedAgentLabel: "label-agent",
		},
		{
			label: "labels null coalesces",
			setup: (req) => {
				req.config = { labels: null as any } as any;
			},
			expectedAgentLabel: "label-agent",
		},
		{
			label: "pre-existing adk_agent_name preserved",
			setup: (req) => {
				req.config = {
					labels: { adk_agent_name: "pre-set" },
				} as any;
			},
			expectedAgentLabel: "pre-set",
		},
		{
			label: "other labels retained alongside agent label",
			setup: (req) => {
				req.config = {
					labels: { env: "test", team: "adk" },
				} as any;
			},
			expectedAgentLabel: "label-agent",
		},
	];

	for (const { label, setup, expectedAgentLabel } of configMatrix) {
		it(label, async () => {
			const flow = new InspectableFlow();
			const agent = {
				name: "label-agent",
				canonicalModel: {
					model: "fake",
					generateContentAsync: vi.fn(async function* () {
						yield { content: { parts: [{ text: "x" }] } };
					}),
				},
			};
			const llmRequest = new LlmRequest();
			setup(llmRequest);
			await collect(
				flow._callLlmAsync(
					makeCtx({ agent }),
					llmRequest,
					new Event({ id: "m", author: "label-agent" }),
				),
			);
			expect(llmRequest.config).toBeTruthy();
			expect(llmRequest.config?.labels?.adk_agent_name).toBe(
				expectedAgentLabel,
			);
			if (label.includes("other labels")) {
				expect(llmRequest.config?.labels?.env).toBe("test");
				expect(llmRequest.config?.labels?.team).toBe("adk");
			}
		});
	}
});

describe("base-llm-flow leftover: supportCfc path", () => {
	const cfcMatrix = [
		{ supportCfc: true, expectWarn: true },
		{ supportCfc: false, expectWarn: false },
		{ supportCfc: undefined, expectWarn: false },
		{ supportCfc: 1, expectWarn: true },
		{ supportCfc: "yes", expectWarn: true },
	];

	for (const { supportCfc, expectWarn } of cfcMatrix) {
		it(`supportCfc=${JSON.stringify(supportCfc)}`, async () => {
			const flow = new InspectableFlow();
			const warn = vi.spyOn((flow as any).logger, "warn");
			const agent = {
				name: "cfc-agent",
				canonicalModel: {
					model: "fake",
					generateContentAsync: vi.fn(async function* () {
						yield { content: { parts: [{ text: "ok" }] } };
					}),
				},
			};
			await collect(
				flow._callLlmAsync(
					makeCtx({
						agent,
						runConfig: { streamingMode: "none", supportCfc },
					}),
					new LlmRequest(),
					new Event({ id: "m", author: "cfc-agent" }),
				),
			);
			if (expectWarn) {
				expect(warn).toHaveBeenCalledWith(
					expect.stringContaining("supportCfc"),
				);
			} else {
				expect(
					warn.mock.calls.some((c) =>
						String(c[0] ?? "").includes("supportCfc"),
					),
				).toBe(false);
			}
		});
	}
});
