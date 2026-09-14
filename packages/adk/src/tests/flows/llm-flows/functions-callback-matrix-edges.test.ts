import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { Event } from "../../../events/event";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";
import { handleFunctionCallsAsync } from "../../../flows/llm-flows/functions";

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
		invocationId: "inv-callback-matrix",
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

function functionCallEvent(
	calls: Array<{ name: string; id?: string; args?: Record<string, unknown> }>,
): Event {
	return new Event({
		author: "agent",
		invocationId: "inv-callback-matrix",
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

function llmAgent(partial: {
	before?: Array<(...args: any[]) => Promise<any>>;
	after?: Array<(...args: any[]) => Promise<any>>;
	name?: string;
}) {
	return makeInvocationContext({
		name: partial.name ?? "llm-agent",
		canonicalModel: "gpt-4o",
		canonicalBeforeToolCallbacks: partial.before ?? [],
		canonicalAfterToolCallbacks: partial.after ?? [],
	});
}

describe("handleFunctionCallsAsync before+after combined matrix", () => {
	it("before override skips tool execution and never invokes after callbacks", async () => {
		const runAsync = vi.fn(async () => ({ ran: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args for override" },
			runAsync,
		);
		const before = vi.fn(async () => ({ overridden: true }));
		const after = vi.fn(async () => ({ after: true }));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: { x: 1 } }]),
			{ echo_tool: tool },
		);

		expect(runAsync).not.toHaveBeenCalled();
		expect(before).toHaveBeenCalledTimes(1);
		expect(after).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			overridden: true,
		});
	});

	it("before nullish then after mutates the tool result", async () => {
		const runAsync = vi.fn(async (args) => ({ original: true, args }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Echoes input args for mutation" },
			runAsync,
		);
		const beforeNull = vi.fn(async () => null);
		const beforeUndefined = vi.fn(async () => undefined);
		const after = vi.fn(async (_t, _a, _c, result) => ({
			...result,
			mutated: true,
		}));

		const result = await handleFunctionCallsAsync(
			llmAgent({
				before: [beforeNull, beforeUndefined],
				after: [after],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: { v: 9 } }]),
			{ echo_tool: tool },
		);

		expect(runAsync).toHaveBeenCalledWith({ v: 9 });
		expect(beforeNull).toHaveBeenCalled();
		expect(beforeUndefined).toHaveBeenCalled();
		expect(after).toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			original: true,
			args: { v: 9 },
			mutated: true,
		});
	});

	it("first before returning a value short-circuits later before and after", async () => {
		const runAsync = vi.fn(async () => ({ ran: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Short-circuit before chain" },
			runAsync,
		);
		const before1 = vi.fn(async () => ({ from: "before1" }));
		const before2 = vi.fn(async () => ({ from: "before2" }));
		const after = vi.fn(async () => ({ from: "after" }));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before1, before2], after: [after] }),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(before1).toHaveBeenCalled();
		expect(before2).not.toHaveBeenCalled();
		expect(runAsync).not.toHaveBeenCalled();
		expect(after).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			from: "before1",
		});
	});

	it("after chain stops at first non-nullish modification", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "After chain break" },
			async () => ({ original: true }),
		);
		const after1 = vi.fn(async () => null);
		const after2 = vi.fn(async () => ({ second: true }));
		const after3 = vi.fn(async () => ({ third: true }));

		const result = await handleFunctionCallsAsync(
			llmAgent({
				before: [async () => null],
				after: [after1, after2, after3],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(after1).toHaveBeenCalled();
		expect(after2).toHaveBeenCalled();
		expect(after3).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			second: true,
		});
	});

	it("filters combined with before override only runs filtered call", async () => {
		const runA = vi.fn(async () => ({ a: true }));
		const runB = vi.fn(async () => ({ b: true }));
		const toolA = new FakeTool(
			{ name: "a", description: "Tool A for filter matrix" },
			runA,
		);
		const toolB = new FakeTool(
			{ name: "b", description: "Tool B for filter matrix" },
			runB,
		);
		const beforeA = vi.fn(async () => ({ overriddenA: true }));
		const afterB = vi.fn(async () => ({ afterB: true }));

		const result = await handleFunctionCallsAsync(
			llmAgent({
				before: [beforeA],
				after: [afterB],
			}),
			functionCallEvent([
				{ name: "a", id: "keep", args: {} },
				{ name: "b", id: "skip", args: {} },
			]),
			{ a: toolA, b: toolB },
			new Set(["keep"]),
		);

		expect(beforeA).toHaveBeenCalledTimes(1);
		expect(runA).not.toHaveBeenCalled();
		expect(runB).not.toHaveBeenCalled();
		expect(afterB).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].response).toEqual({
			overriddenA: true,
		});
	});

	it("filters keep id runs before-nullish + after mutate only for that id", async () => {
		const runAsync = vi.fn(async (args) => ({ n: args.n }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Filtered mutate path" },
			runAsync,
		);
		const before = vi.fn(async () => undefined);
		const after = vi.fn(async (_t, _a, _c, result) => ({
			...result,
			kept: true,
		}));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([
				{ name: "echo_tool", id: "keep", args: { n: 1 } },
				{ name: "echo_tool", id: "drop", args: { n: 2 } },
			]),
			{ echo_tool: tool },
			new Set(["keep"]),
		);

		expect(runAsync).toHaveBeenCalledTimes(1);
		expect(runAsync).toHaveBeenCalledWith({ n: 1 });
		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("keep");
		expect(result?.getFunctionResponses()[0].response).toEqual({
			n: 1,
			kept: true,
		});
	});

	it("long-running falsy mix: skips falsy long-running, runs after on fast tool", async () => {
		const slow = new FakeTool(
			{
				name: "slow",
				description: "Long running falsy result tool",
				isLongRunning: true,
			},
			async () => null,
		);
		const fastRun = vi.fn(async () => ({ fast: true }));
		const fast = new FakeTool(
			{ name: "fast", description: "Quick companion tool" },
			fastRun,
		);
		const before = vi.fn(async () => null);
		const after = vi.fn(async (_t, _a, _c, result) => ({
			...result,
			post: true,
		}));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([
				{ name: "slow", id: "lr" },
				{ name: "fast", id: "f" },
			]),
			{ slow, fast },
		);

		expect(fastRun).toHaveBeenCalled();
		expect(after).toHaveBeenCalledTimes(1);
		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("f");
		expect(result?.getFunctionResponses()[0].response).toEqual({
			fast: true,
			post: true,
		});
	});

	it("long-running falsy mix: before override on slow still yields response (skips long-running check)", async () => {
		const slowRun = vi.fn(async () => null);
		const slow = new FakeTool(
			{
				name: "slow",
				description: "Long running overridden tool",
				isLongRunning: true,
			},
			slowRun,
		);
		const before = vi.fn(async () => ({ forced: true }));
		const after = vi.fn(async () => ({ after: true }));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([{ name: "slow", id: "lr" }]),
			{ slow },
		);

		expect(slowRun).not.toHaveBeenCalled();
		expect(after).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			forced: true,
		});
	});

	it("long-running tool that returns 0 is treated as falsy and skipped before after", async () => {
		const after = vi.fn(async () => ({ after: true }));
		const zeroTool = new FakeTool(
			{
				name: "zero",
				description: "Long running returning zero",
				isLongRunning: true,
			},
			async () => 0,
		);
		const keep = new FakeTool(
			{ name: "keep", description: "Non long-running keeper" },
			async () => ({ keep: true }),
		);

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [], after: [after] }),
			functionCallEvent([
				{ name: "zero", id: "z" },
				{ name: "keep", id: "k" },
			]),
			{ zero: zeroTool, keep },
		);

		expect(after).toHaveBeenCalledTimes(1);
		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("k");
	});

	it("long-running tool returning empty string is skipped; false boolean too", async () => {
		const empty = new FakeTool(
			{
				name: "empty",
				description: "Long running empty string",
				isLongRunning: true,
			},
			async () => "",
		);
		const falsy = new FakeTool(
			{
				name: "falsy",
				description: "Long running false boolean",
				isLongRunning: true,
			},
			async () => false,
		);
		const ok = new FakeTool(
			{ name: "ok", description: "Normal tool in falsy mix" },
			async () => ({ ok: true }),
		);

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [async () => undefined], after: [] }),
			functionCallEvent([
				{ name: "empty", id: "e" },
				{ name: "falsy", id: "f" },
				{ name: "ok", id: "o" },
			]),
			{ empty, falsy, ok },
		);

		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("o");
	});

	it("before can mutate args object that tool and after both observe", async () => {
		const runAsync = vi.fn(async (args) => ({ saw: args }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Observes mutated args" },
			runAsync,
		);
		const before = vi.fn(async (_tool, args) => {
			args.injected = "by-before";
			return null;
		});
		const after = vi.fn(async (_t, args, _c, result) => ({
			result,
			argsSnapshot: { ...args },
		}));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([{ name: "echo_tool", id: "c1", args: { base: 1 } }]),
			{ echo_tool: tool },
		);

		expect(runAsync).toHaveBeenCalledWith({ base: 1, injected: "by-before" });
		expect(result?.getFunctionResponses()[0].response).toEqual({
			result: { saw: { base: 1, injected: "by-before" } },
			argsSnapshot: { base: 1, injected: "by-before" },
		});
	});

	it("filter excluding all calls skips before and after entirely", async () => {
		const before = vi.fn(async () => ({ x: 1 }));
		const after = vi.fn(async () => ({ y: 1 }));
		const tool = new FakeTool({
			name: "echo_tool",
			description: "Never invoked due to filter",
		});

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([
				{ name: "echo_tool", id: "a" },
				{ name: "echo_tool", id: "b" },
			]),
			{ echo_tool: tool },
			new Set(["never"]),
		);

		expect(result).toBeNull();
		expect(before).not.toHaveBeenCalled();
		expect(after).not.toHaveBeenCalled();
	});

	it("parallel tools each get before+after independently then merge", async () => {
		const a = new FakeTool(
			{ name: "a", description: "Parallel tool A" },
			async () => ({ a: 1 }),
		);
		const b = new FakeTool(
			{ name: "b", description: "Parallel tool B" },
			async () => ({ b: 2 }),
		);
		const before = vi.fn(async () => null);
		const after = vi.fn(async (_t, _a, _c, result) => ({
			...result,
			tagged: true,
		}));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([
				{ name: "a", id: "1" },
				{ name: "b", id: "2" },
			]),
			{ a, b },
		);

		expect(before).toHaveBeenCalledTimes(2);
		expect(after).toHaveBeenCalledTimes(2);
		expect(result?.getFunctionResponses()).toHaveLength(2);
		expect(result?.getFunctionResponses().map((r) => r.response)).toEqual([
			{ a: 1, tagged: true },
			{ b: 2, tagged: true },
		]);
	});

	it("before override with primitive wraps via buildResponseEvent", async () => {
		const tool = new FakeTool({
			name: "echo_tool",
			description: "Before returns primitive",
		});
		const before = vi.fn(async () => "overridden-string");
		const after = vi.fn(async () => ({ after: true }));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(after).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			result: "overridden-string",
		});
	});

	it("after returning undefined keeps prior after/tool result (nullish continue)", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "After undefined keeps result" },
			async () => ({ original: true }),
		);
		const afterUndef = vi.fn(async () => undefined);
		const afterNull = vi.fn(async () => null);

		const result = await handleFunctionCallsAsync(
			llmAgent({
				before: [async () => null],
				after: [afterUndef, afterNull],
			}),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(afterUndef).toHaveBeenCalled();
		expect(afterNull).toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			original: true,
		});
	});

	it("mixed filter: one id before-override, another id before-nullish+after", async () => {
		const runKeep = vi.fn(async () => ({ keepRan: true }));
		const runOther = vi.fn(async () => ({ otherRan: true }));
		const keep = new FakeTool(
			{ name: "keep", description: "Keep tool with after mutate" },
			runKeep,
		);
		const other = new FakeTool(
			{ name: "other", description: "Other tool before override" },
			runOther,
		);

		let callCount = 0;
		const before = vi.fn(async (tool) => {
			callCount++;
			if (tool.name === "other") {
				return { forcedOther: true };
			}
			return null;
		});
		const after = vi.fn(async (_t, _a, _c, result) => ({
			...result,
			aftered: true,
		}));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([
				{ name: "keep", id: "k" },
				{ name: "other", id: "o" },
			]),
			{ keep, other },
			new Set(["k", "o"]),
		);

		expect(callCount).toBe(2);
		expect(runKeep).toHaveBeenCalled();
		expect(runOther).not.toHaveBeenCalled();
		expect(after).toHaveBeenCalledTimes(1);
		const responses = result?.getFunctionResponses() ?? [];
		expect(responses).toHaveLength(2);
		expect(responses.find((r) => r.id === "k")?.response).toEqual({
			keepRan: true,
			aftered: true,
		});
		expect(responses.find((r) => r.id === "o")?.response).toEqual({
			forcedOther: true,
		});
	});

	it("long-running undefined among three calls keeps only truthy responses", async () => {
		const lr = new FakeTool(
			{
				name: "lr",
				description: "Long running undefined",
				isLongRunning: true,
			},
			async () => undefined,
		);
		const mid = new FakeTool(
			{ name: "mid", description: "Middle normal tool" },
			async () => ({ mid: true }),
		);
		const last = new FakeTool(
			{
				name: "last",
				description: "Last long running null",
				isLongRunning: true,
			},
			async () => null,
		);
		const after = vi.fn(async (_t, _a, _c, r) => r);

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [], after: [after] }),
			functionCallEvent([
				{ name: "lr", id: "1" },
				{ name: "mid", id: "2" },
				{ name: "last", id: "3" },
			]),
			{ lr, mid, last },
		);

		expect(after).toHaveBeenCalledTimes(1);
		expect(result?.getFunctionResponses()).toHaveLength(1);
		expect(result?.getFunctionResponses()[0].id).toBe("2");
	});

	it("before override false (boolean) is treated as override and skips after", async () => {
		const runAsync = vi.fn(async () => ({ ran: true }));
		const tool = new FakeTool(
			{ name: "echo_tool", description: "Before returns false" },
			runAsync,
		);
		const before = vi.fn(async () => false);
		const after = vi.fn(async () => ({ after: true }));

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [before], after: [after] }),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(runAsync).not.toHaveBeenCalled();
		expect(after).not.toHaveBeenCalled();
		expect(result?.getFunctionResponses()[0].response).toEqual({
			result: false,
		});
	});

	it("after returning 0 is treated as modification and replaces tool result", async () => {
		const tool = new FakeTool(
			{ name: "echo_tool", description: "After returns zero" },
			async () => ({ original: true }),
		);
		const after = vi.fn(async () => 0);

		const result = await handleFunctionCallsAsync(
			llmAgent({ before: [async () => null], after: [after] }),
			functionCallEvent([{ name: "echo_tool", id: "c1" }]),
			{ echo_tool: tool },
		);

		expect(result?.getFunctionResponses()[0].response).toEqual({ result: 0 });
	});
});
