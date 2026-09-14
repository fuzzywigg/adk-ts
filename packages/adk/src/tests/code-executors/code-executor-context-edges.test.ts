import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

describe("CodeExecutorContext edges", () => {
	describe("errorCounts[id] ?? 0", () => {
		it("returns 0 when error count map is absent", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			expect(context.getErrorCount("missing")).toBe(0);
		});

		it("returns 0 when map exists but invocation id is missing", () => {
			const state = State.create({}, {});
			state["_code_executor_error_counts"] = {};
			const context = new CodeExecutorContext(state);
			expect(context.getErrorCount("missing")).toBe(0);
		});

		it("returns stored count for known invocation ids", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			context.incrementErrorCount("inv-a");
			context.incrementErrorCount("inv-a");
			expect(context.getErrorCount("inv-a")).toBe(2);
			expect(context.getErrorCount("inv-b")).toBe(0);
		});

		it("tracks counts independently across invocation ids", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			context.incrementErrorCount("a");
			context.incrementErrorCount("b");
			context.incrementErrorCount("b");
			expect(context.getErrorCount("a")).toBe(1);
			expect(context.getErrorCount("b")).toBe(2);
			expect(context.getErrorCount("c")).toBe(0);
		});
	});

	describe("resetErrorCount early return when map absent", () => {
		it("resetErrorCount is a no-op when error map was never created", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			expect(state["_code_executor_error_counts"]).toBeUndefined();
			context.resetErrorCount("any-id");
			expect(context.getErrorCount("any-id")).toBe(0);
			expect(state["_code_executor_error_counts"]).toBeUndefined();
		});

		it("resetErrorCount removes known ids without affecting others", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			context.incrementErrorCount("known");
			context.incrementErrorCount("other");
			context.resetErrorCount("known");
			expect(context.getErrorCount("known")).toBe(0);
			expect(context.getErrorCount("other")).toBe(1);
		});

		it("resetErrorCount is a no-op for unknown ids when map exists", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			context.incrementErrorCount("known");
			context.resetErrorCount("unknown");
			expect(context.getErrorCount("known")).toBe(1);
			expect(context.getErrorCount("unknown")).toBe(0);
		});
	});

	describe("related context edges", () => {
		it("getExecutionId returns null when session id key is absent", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			expect(context.getExecutionId()).toBeNull();
		});

		it("getProcessedFileNames returns [] when key is absent", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			expect(context.getProcessedFileNames()).toEqual([]);
		});

		it("getInputFiles returns [] when input file key is absent", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			expect(context.getInputFiles()).toEqual([]);
		});

		it("clearInputFiles no-ops when no input files were stored", () => {
			const state = State.create({}, {});
			const context = new CodeExecutorContext(state);
			context.clearInputFiles();
			expect(context.getInputFiles()).toEqual([]);
			expect(context.getProcessedFileNames()).toEqual([]);
		});
	});
});
