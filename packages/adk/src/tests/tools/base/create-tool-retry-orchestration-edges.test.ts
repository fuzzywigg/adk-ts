import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createTool } from "../../../tools/base/create-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return { actions: {} } as ToolContext;
}

describe("createTool retry orchestration leftovers", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("swallows fn throws as result envelopes so safeExecute never retries", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
		let calls = 0;

		const tool = createTool({
			name: "create_swallows",
			description: "Errors become result payloads",
			schema: z.object({ q: z.string() }),
			shouldRetryOnFailure: true,
			maxRetryAttempts: 3,
			fn: async () => {
				calls += 1;
				throw new Error("inside-fn");
			},
		});
		tool.baseRetryDelay = 1000;
		tool.maxRetryDelay = 1000;

		const pending = tool.safeExecute({ q: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			result: {
				error: "Error executing create_swallows: inside-fn",
			},
		});
		expect(calls).toBe(1);
		expect(setTimeoutSpy).not.toHaveBeenCalled();
	});

	it("still retries when a subclassed createTool runAsync rethrows", async () => {
		vi.useFakeTimers();
		vi.spyOn(Math, "random").mockReturnValue(0);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const base = createTool({
			name: "create_rethrow",
			description: "Subclass rethrows for retry path",
			schema: z.object({ q: z.string() }),
			shouldRetryOnFailure: true,
			maxRetryAttempts: 2,
			fn: async () => ({ ok: true }),
		});

		let calls = 0;
		base.runAsync = async () => {
			calls += 1;
			throw new Error(`rethrow-${calls}`);
		};
		base.baseRetryDelay = 1;
		base.maxRetryDelay = 1;

		const pending = base.safeExecute({ q: "x" }, makeContext());
		await vi.runAllTimersAsync();
		await expect(pending).resolves.toEqual({
			error: "Execution failed",
			message: "rethrow-3",
			tool: "create_rethrow",
		});
		expect(calls).toBe(3);
	});

	it("honors shouldRetryOnFailure false when runAsync rethrows", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const tool = createTool({
			name: "create_no_retry",
			description: "No retry when disabled",
			schema: z.object({ q: z.string() }),
			shouldRetryOnFailure: false,
			maxRetryAttempts: 5,
			fn: async () => ({ ok: true }),
		});
		let calls = 0;
		tool.runAsync = async () => {
			calls += 1;
			throw new Error("once");
		};

		await expect(tool.safeExecute({ q: "x" }, makeContext())).resolves.toEqual({
			error: "Execution failed",
			message: "once",
			tool: "create_no_retry",
		});
		expect(calls).toBe(1);
	});

	it("propagates createTool retry option defaults onto BaseTool fields", () => {
		const tool = createTool({
			name: "create_defaults",
			description: "Retry defaults",
			fn: () => ({}),
		});
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);

		const retrier = createTool({
			name: "create_opts",
			description: "Explicit retry opts",
			shouldRetryOnFailure: true,
			maxRetryAttempts: 7,
			fn: () => ({}),
		});
		expect(retrier.shouldRetryOnFailure).toBe(true);
		expect(retrier.maxRetryAttempts).toBe(7);
	});
});
