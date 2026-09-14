import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { EventActions } from "../../../events/event-actions";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";
import {
	AF_FUNCTION_CALL_ID_PREFIX,
	generateAuthEvent,
	generateClientFunctionCallId,
	getLongRunningFunctionCalls,
	handleFunctionCallsAsync,
	handleFunctionCallsLive,
	mergeParallelFunctionResponseEvents,
	populateClientFunctionCallId,
	removeClientFunctionCallId,
} from "../../../flows/llm-flows/functions";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

vi.mock("../../../telemetry", () => ({
	telemetryService: {
		getTracer: vi.fn(() => ({
			startSpan: () => ({
				setStatus: vi.fn(),
				recordException: vi.fn(),
				end: vi.fn(),
			}),
		})),
		traceToolCall: vi.fn(),
	},
}));

class FakeTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
	) {
		super(config);
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		if (this.impl) {
			return this.impl(args);
		}
		return { ok: true, args };
	}
}

function makeInvocationContext(
	agent: Record<string, unknown>,
): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent,
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

function llmAgent(overrides: Record<string, unknown> = {}) {
	return {
		name: "llm-agent",
		canonicalModel: "gpt-4o",
		canonicalBeforeToolCallbacks: [],
		canonicalAfterToolCallbacks: [],
		...overrides,
	};
}

function functionCallEvent(
	calls: Array<{ name: string; id?: string; args?: Record<string, unknown> }>,
): Event {
	return new Event({
		author: "agent",
		invocationId: "inv-1",
		content: {
			role: "model",
			parts: calls.map((c) => ({
				functionCall: {
					name: c.name,
					id: c.id,
					args: c.args ?? {},
				},
			})),
		},
	});
}

describe("functions leftover: !functionCalls early return", () => {
	const falsyMatrix: Array<{
		label: string;
		value: unknown;
	}> = [
		{ label: "undefined", value: undefined },
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "empty string", value: "" },
	];

	for (const { label, value } of falsyMatrix) {
		it(`populateClientFunctionCallId returns early for ${label}`, () => {
			const event = new Event({
				author: "agent",
				content: { role: "model", parts: [] },
			});
			vi.spyOn(event, "getFunctionCalls").mockReturnValue(
				value as ReturnType<Event["getFunctionCalls"]>,
			);
			expect(() => populateClientFunctionCallId(event)).not.toThrow();
		});

		it(`handleFunctionCallsAsync returns null for ${label}`, async () => {
			const event = new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "x" }] },
			});
			vi.spyOn(event, "getFunctionCalls").mockReturnValue(
				value as ReturnType<Event["getFunctionCalls"]>,
			);
			const result = await handleFunctionCallsAsync(
				makeInvocationContext(llmAgent()),
				event,
				{},
			);
			expect(result).toBeNull();
		});
	}

	it("empty function calls array falls through to empty merge path → null", async () => {
		const result = await handleFunctionCallsAsync(
			makeInvocationContext(llmAgent()),
			new Event({
				author: "agent",
				content: { role: "model", parts: [{ text: "no fc" }] },
			}),
			{},
		);
		expect(result).toBeNull();
	});
});

describe("functions leftover: args || {}", () => {
	const argsMatrix: Array<{
		label: string;
		args: unknown;
		expected: Record<string, unknown>;
	}> = [
		{ label: "undefined args", args: undefined, expected: {} },
		{ label: "null args", args: null, expected: {} },
		{ label: "empty object", args: {}, expected: {} },
		{
			label: "populated object",
			args: { q: "hi", n: 1 },
			expected: { q: "hi", n: 1 },
		},
		{
			label: "falsy 0 object preserved via truthy object",
			args: { z: 0 },
			expected: { z: 0 },
		},
	];

	for (const { label, args, expected } of argsMatrix) {
		it(`coalesces ${label}`, async () => {
			const runAsync = vi.fn(async (received) => ({ received }));
			const tool = new FakeTool(
				{ name: "echo_tool", description: "echo" },
				runAsync,
			);
			const event = new Event({
				author: "agent",
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								name: "echo_tool",
								id: "c1",
								...(args === undefined
									? {}
									: { args: args as Record<string, unknown> }),
							},
						},
					],
				},
			});
			if (args === null) {
				(event.content!.parts![0].functionCall as any).args = null;
			}

			const result = await handleFunctionCallsAsync(
				makeInvocationContext(llmAgent()),
				event,
				{ echo_tool: tool },
			);

			expect(runAsync).toHaveBeenCalledWith(expected);
			expect(result?.getFunctionResponses()[0].response).toEqual({
				received: expected,
			});
		});
	}
});

describe("functions leftover: empty merge throw", () => {
	it("mergeParallelFunctionResponseEvents throws on empty array", () => {
		expect(() => mergeParallelFunctionResponseEvents([])).toThrow(
			"No function response events provided.",
		);
	});

	const emptyish: Array<{ label: string; events: Event[] }> = [
		{ label: "literally empty", events: [] },
	];

	for (const { label, events } of emptyish) {
		it(`throws for ${label}`, () => {
			expect(() => mergeParallelFunctionResponseEvents(events)).toThrow(
				/No function response events/,
			);
		});
	}

	it("single event short-circuits without merge throw", () => {
		const single = new Event({
			author: "agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							name: "only",
							id: "1",
							response: { ok: true },
						},
					},
				],
			},
		});
		expect(mergeParallelFunctionResponseEvents([single])).toBe(single);
	});

	it("two events merge without throw", () => {
		const a = new Event({
			author: "agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: { name: "a", id: "1", response: { a: 1 } },
					},
				],
			},
		});
		const b = new Event({
			author: "agent",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: { name: "b", id: "2", response: { b: 2 } },
					},
				],
			},
		});
		const merged = mergeParallelFunctionResponseEvents([a, b]);
		expect(merged.getFunctionResponses()).toHaveLength(2);
	});
});

describe("functions leftover: before-tool override", () => {
	const overrideMatrix: Array<{
		label: string;
		override: unknown;
		expectToolRun: boolean;
		expectedResponse: unknown;
	}> = [
		{
			label: "object override skips tool",
			override: { overridden: true },
			expectToolRun: false,
			expectedResponse: { overridden: true },
		},
		{
			label: "string override skips tool",
			override: "blocked",
			expectToolRun: false,
			expectedResponse: { result: "blocked" },
		},
		{
			label: "number override skips tool",
			override: 42,
			expectToolRun: false,
			expectedResponse: { result: 42 },
		},
		{
			label: "false override skips tool (not nullish)",
			override: false,
			expectToolRun: false,
			expectedResponse: { result: false },
		},
		{
			label: "0 override skips tool",
			override: 0,
			expectToolRun: false,
			expectedResponse: { result: 0 },
		},
		{
			label: "null continues to tool",
			override: null,
			expectToolRun: true,
			expectedResponse: { ran: true },
		},
		{
			label: "undefined continues to tool",
			override: undefined,
			expectToolRun: true,
			expectedResponse: { ran: true },
		},
	];

	for (const {
		label,
		override,
		expectToolRun,
		expectedResponse,
	} of overrideMatrix) {
		it(label, async () => {
			const runAsync = vi.fn(async () => ({ ran: true }));
			const tool = new FakeTool(
				{ name: "echo_tool", description: "echo" },
				runAsync,
			);
			const before = vi.fn(async () => override);
			const result = await handleFunctionCallsAsync(
				makeInvocationContext(
					llmAgent({ canonicalBeforeToolCallbacks: [before] }),
				),
				functionCallEvent([{ name: "echo_tool", id: "c1", args: { x: 1 } }]),
				{ echo_tool: tool },
			);

			expect(before).toHaveBeenCalled();
			if (expectToolRun) {
				expect(runAsync).toHaveBeenCalled();
			} else {
				expect(runAsync).not.toHaveBeenCalled();
			}
			expect(result?.getFunctionResponses()[0].response).toEqual(
				expectedResponse,
			);
		});
	}

	it("first truthy before callback wins among chain", async () => {
		const runAsync = vi.fn(async () => ({ ran: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "echo" },
			runAsync,
		);
		const first = vi.fn(async () => null);
		const second = vi.fn(async () => ({ from: "second" }));
		const third = vi.fn(async () => ({ from: "third" }));

		const result = await handleFunctionCallsAsync(
			makeInvocationContext(
				llmAgent({
					canonicalBeforeToolCallbacks: [first, second, third],
				}),
			),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(first).toHaveBeenCalled();
		expect(second).toHaveBeenCalled();
		expect(third).not.toHaveBeenCalled();
		expect(runAsync).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			from: "second",
		});
	});
});

describe("functions leftover: after-tool null/undefined skip", () => {
	const afterMatrix: Array<{
		label: string;
		callbacks: Array<() => Promise<unknown>>;
		expected: unknown;
	}> = [
		{
			label: "null after keeps original",
			callbacks: [async () => null],
			expected: { original: true },
		},
		{
			label: "undefined after keeps original",
			callbacks: [async () => undefined],
			expected: { original: true },
		},
		{
			label: "null then undefined then modify",
			callbacks: [
				async () => null,
				async () => undefined,
				async () => ({ modified: true }),
			],
			expected: { modified: true },
		},
		{
			label: "modify then later ignored",
			callbacks: [
				async () => ({ first: true }),
				async () => ({ second: true }),
			],
			expected: { first: true },
		},
		{
			label: "false after replaces (not nullish)",
			callbacks: [async () => false],
			expected: { result: false },
		},
		{
			label: "empty string after replaces",
			callbacks: [async () => ""],
			expected: { result: "" },
		},
	];

	for (const { label, callbacks, expected } of afterMatrix) {
		it(label, async () => {
			const tool = new FakeTool(
				{ name: "echo_tool", description: "echo" },
				async () => ({ original: true }),
			);
			const result = await handleFunctionCallsAsync(
				makeInvocationContext(
					llmAgent({ canonicalAfterToolCallbacks: callbacks }),
				),
				functionCallEvent([{ name: "echo_tool", id: "c1" }]),
				{ echo_tool: tool },
			);
			expect(result?.getFunctionResponses()[0].response).toEqual(expected);
		});
	}
});

describe("functions leftover: live path and misc coalesce", () => {
	it("handleFunctionCallsLive delegates with args coalesce", async () => {
		const runAsync = vi.fn(async (args) => ({ live: args }));
		const tool = new FakeTool(
			{ name: "live_tool", description: "live" },
			runAsync,
		);
		const event = new Event({
			author: "agent",
			content: {
				role: "model",
				parts: [{ functionCall: { name: "live_tool", id: "l1" } }],
			},
		});
		const result = await handleFunctionCallsLive(
			makeInvocationContext(llmAgent()),
			event,
			{ live_tool: tool },
		);
		expect(runAsync).toHaveBeenCalledWith({});
		expect(result?.getFunctionResponses()[0].response).toEqual({ live: {} });
	});

	it("getLongRunningFunctionCalls ignores missing ids", () => {
		const slow = new FakeTool({
			name: "slow",
			description: "slow",
			isLongRunning: true,
		});
		const ids = getLongRunningFunctionCalls(
			[
				{ name: "slow" },
				{ name: "slow", id: "keep" },
				{ name: "missing", id: "m" },
			],
			{ slow },
		);
		expect([...ids]).toEqual(["keep"]);
	});

	it("removeClientFunctionCallId tolerates missing parts", () => {
		expect(() =>
			removeClientFunctionCallId({ role: "user" } as any),
		).not.toThrow();
		expect(() => removeClientFunctionCallId(undefined as any)).not.toThrow();
	});

	it("generateClientFunctionCallId uses AF prefix", () => {
		expect(
			generateClientFunctionCallId().startsWith(AF_FUNCTION_CALL_ID_PREFIX),
		).toBe(true);
	});

	it("generateAuthEvent null without requestedAuthConfigs", () => {
		expect(
			generateAuthEvent(
				makeInvocationContext(llmAgent()),
				new Event({
					author: "agent",
					actions: new EventActions(),
					content: { role: "user", parts: [] },
				}),
			),
		).toBeNull();
	});
});
