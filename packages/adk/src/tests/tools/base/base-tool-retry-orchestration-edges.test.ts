import { Type } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseTool } from "../../../tools/base/base-tool";
import type { ToolContext } from "../../../tools/tool-context";

class StubTool extends BaseTool {
	constructor(
		config: ConstructorParameters<typeof BaseTool>[0],
		private readonly impl?: (args: Record<string, any>) => Promise<any>,
	) {
		super(config);
	}

	getDeclaration() {
		return {
			name: this.name,
			description: this.description,
			parameters: {
				type: Type.OBJECT,
				properties: {
					query: { type: Type.STRING },
				},
				required: ["query"],
			},
		};
	}

	async runAsync(args: Record<string, any>, _context: ToolContext) {
		if (this.impl) {
			return this.impl(args);
		}
		return { ok: true, args };
	}
}

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

function captureDelays(): {
	delays: number[];
	restore: () => void;
} {
	const delays: number[] = [];
	const realSetTimeout = globalThis.setTimeout;
	const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
		handler: TimerHandler,
		timeout?: number,
		...args: any[]
	) => {
		delays.push(timeout ?? 0);
		return realSetTimeout(handler as any, 0, ...args);
	}) as any);
	return {
		delays,
		restore: () => {
			spy.mockRestore();
		},
	};
}

describe("BaseTool safeExecute retry orchestration leftovers", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it.each([
		{ random: 0, base: 1000, attempt: 1, max: 10000, expected: 1000 },
		{ random: 0.5, base: 1000, attempt: 1, max: 10000, expected: 1500 },
		{ random: 0.999, base: 1000, attempt: 1, max: 10000, expected: 1999 },
		{ random: 0, base: 1000, attempt: 2, max: 10000, expected: 2000 },
		{ random: 0.25, base: 1000, attempt: 2, max: 10000, expected: 2250 },
		{ random: 0, base: 1000, attempt: 3, max: 10000, expected: 4000 },
		{ random: 0.1, base: 5000, attempt: 1, max: 5200, expected: 5100 },
		{ random: 0.9, base: 5000, attempt: 1, max: 5200, expected: 5200 },
		{ random: 0, base: 8000, attempt: 2, max: 9000, expected: 9000 },
		{ random: 0.999, base: 100, attempt: 4, max: 2000, expected: 1799 },
	])("jitter boundary random=$random base=$base attempt=$attempt max=$max → $expected", async ({
		random,
		base,
		attempt,
		max,
		expected,
	}) => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(random);
		vi.spyOn(console, "error").mockImplementation(() => {});

		let calls = 0;
		const tool = new StubTool(
			{
				name: `jitter_${attempt}_${String(random).replace(".", "_")}`,
				description: "Measures jitter delay boundaries",
				shouldRetryOnFailure: true,
				maxRetryAttempts: attempt,
			},
			async () => {
				calls += 1;
				if (calls <= attempt) {
					throw new Error(`fail-${calls}`);
				}
				return { ok: true };
			},
		);
		tool.baseRetryDelay = base;
		tool.maxRetryDelay = max;
		const { delays, restore } = captureDelays();

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { ok: true } });

		expect(delays).toHaveLength(attempt);
		expect(delays[attempt - 1]).toBe(expected);
		restore();
	});

	it("applies full exponential+jitter series until exhaustion envelope", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		vi.spyOn(console, "error").mockImplementation(() => {});

		let calls = 0;
		const tool = new StubTool(
			{
				name: "exhaust_series",
				description: "Exhausts every retry with measured delays",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 3,
			},
			async () => {
				calls += 1;
				throw new Error(`always-${calls}`);
			},
		);
		tool.baseRetryDelay = 1000;
		tool.maxRetryDelay = 10000;
		const { delays, restore } = captureDelays();

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			error: "Execution failed",
			message: "always-4",
			tool: "exhaust_series",
		});

		expect(calls).toBe(4);
		expect(delays).toEqual([1500, 2500, 4500]);
		restore();
	});

	it.each([
		0, 1, 2, 3, 5,
	])("max-retry exhaustion attempts with maxRetryAttempts=%s", async (maxRetryAttempts) => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		vi.spyOn(console, "error").mockImplementation(() => {});

		let calls = 0;
		const tool = new StubTool(
			{
				name: `exhaust_${maxRetryAttempts}`,
				description: "Counts attempts through exhaustion",
				shouldRetryOnFailure: true,
				// Constructor treats 0 as falsy and falls back to 3; assign after.
				maxRetryAttempts: maxRetryAttempts === 0 ? 1 : maxRetryAttempts,
			},
			async () => {
				calls += 1;
				throw new Error("hard-fail");
			},
		);
		tool.maxRetryAttempts = maxRetryAttempts;
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		const result = await pending;

		expect(result).toEqual({
			error: "Execution failed",
			message: "hard-fail",
			tool: `exhaust_${maxRetryAttempts}`,
		});
		expect(calls).toBe(maxRetryAttempts + 1);
	});

	it("does not schedule jitter delay when the first attempt succeeds", async () => {
		vi.useFakeTimers();
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		const tool = new StubTool(
			{
				name: "first_ok",
				description: "Succeeds immediately with retries enabled",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 4,
			},
			async () => ({ ready: true }),
		);

		await expect(
			tool.safeExecute({ query: "x" }, makeContext()),
		).resolves.toEqual({ result: { ready: true } });
		expect(setTimeoutSpy).not.toHaveBeenCalled();
	});

	it("caps jitter when base alone already exceeds maxRetryDelay", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0.999);
		vi.spyOn(console, "error").mockImplementation(() => {});

		let calls = 0;
		const tool = new StubTool(
			{
				name: "already_capped",
				description: "Base delay exceeds max before jitter",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 1,
			},
			async () => {
				calls += 1;
				if (calls === 1) throw new Error("transient");
				return { recovered: true };
			},
		);
		tool.baseRetryDelay = 50_000;
		tool.maxRetryDelay = 100;
		const { delays, restore } = captureDelays();

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({ result: { recovered: true } });
		expect(delays).toEqual([100]);
		restore();
	});

	it("wraps non-Error exhaustion after retries into a string message", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const tool = new StubTool(
			{
				name: "string_exhaust",
				description: "Throws strings through every attempt",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 2,
			},
			async () => {
				throw "plain-string-failure";
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			error: "Execution failed",
			message: "plain-string-failure",
			tool: "string_exhaust",
		});
	});

	it("logs each retry attempt index against maxRetryAttempts", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		vi.spyOn(console, "error").mockImplementation(() => {});

		let calls = 0;
		const tool = new StubTool(
			{
				name: "log_indices",
				description: "Logs every retry index",
				shouldRetryOnFailure: true,
				maxRetryAttempts: 3,
			},
			async () => {
				calls += 1;
				if (calls <= 3) throw new Error(`e${calls}`);
				return { ok: true };
			},
		);
		tool.baseRetryDelay = 1;
		tool.maxRetryDelay = 1;
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});

		const pending = tool.safeExecute({ query: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await pending;

		expect(debug.mock.calls.map((c) => c[0])).toEqual([
			"Retrying tool log_indices (attempt 1 of 3)...",
			"Retrying tool log_indices (attempt 2 of 3)...",
			"Retrying tool log_indices (attempt 3 of 3)...",
		]);
	});
});
