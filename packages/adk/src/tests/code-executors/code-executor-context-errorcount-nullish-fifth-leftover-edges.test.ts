import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

function makeState(seed: Record<string, any> = {}): State {
	return State.create(seed, {});
}

describe("CodeExecutorContext errorCount/executionId nullish fifth leftover", () => {
	it("stored null error count coalesces to 0 via ??", () => {
		const state = makeState();
		state["_code_executor_error_counts"] = { inv: null };
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getErrorCount("inv")).toBe(0);
	});

	it("stored 0 error count stays 0 (?? keeps 0)", () => {
		const state = makeState();
		state["_code_executor_error_counts"] = { inv: 0 };
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getErrorCount("inv")).toBe(0);
		ctx.incrementErrorCount("inv");
		expect(ctx.getErrorCount("inv")).toBe(1);
	});

	it.each([
		undefined,
		null,
		false,
		0,
	] as const)("increment after stored falsy %j uses getErrorCount+1", (seed) => {
		const state = makeState();
		state["_code_executor_error_counts"] = { inv: seed as any };
		const ctx = new CodeExecutorContext(state);
		ctx.incrementErrorCount("inv");
		expect(ctx.getErrorCount("inv")).toBe(1);
	});

	it("increment after stored empty-string concatenates via + (''+1 → '1')", () => {
		const state = makeState();
		state["_code_executor_error_counts"] = { inv: "" };
		const ctx = new CodeExecutorContext(state);
		ctx.incrementErrorCount("inv");
		expect(ctx.getErrorCount("inv")).toBe("1");
	});

	it("execution_session_id key present with undefined returns undefined not null", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			execution_session_id: undefined,
		};
		const ctx = new CodeExecutorContext(state);
		expect(
			"execution_session_id" in (state["_code_execution_context"] as object),
		).toBe(true);
		expect(ctx.getExecutionId()).toBeUndefined();
	});

	it("execution_session_id key present with null returns null (in-operator path)", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			execution_session_id: null,
		};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getExecutionId()).toBeNull();
	});

	it("missing context key returns null via early in-operator check", () => {
		const ctx = new CodeExecutorContext(makeState());
		expect(ctx.getExecutionId()).toBeNull();
	});

	it("getStateDelta deep-copies and does not alias nested mutations", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.setExecutionId("s1");
		ctx.addProcessedFileNames(["a.csv"]);
		const delta = ctx.getStateDelta();
		delta["_code_execution_context"].execution_session_id = "mutated";
		delta["_code_execution_context"].processed_input_files.push("b.csv");
		expect(ctx.getExecutionId()).toBe("s1");
		expect(ctx.getProcessedFileNames()).toEqual(["a.csv"]);
	});
});
