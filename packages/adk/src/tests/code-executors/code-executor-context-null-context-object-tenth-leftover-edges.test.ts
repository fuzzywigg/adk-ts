import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

function makeState(seed: Record<string, any> = {}): State {
	return State.create(seed, {});
}

/**
 * Tenth leftover: `_code_execution_context` / error-count keys present as
 * null/non-object still satisfy `in`, then later `in`/method calls throw.
 */
describe("CodeExecutorContext null context object tenth leftover", () => {
	it.each([
		null,
		0,
		false,
		"",
	] as const)("_code_execution_context=%j makes getExecutionId throw on `in`", (seed) => {
		const state = makeState();
		state["_code_execution_context"] = seed as any;
		const ctx = new CodeExecutorContext(state);
		expect(() => ctx.getExecutionId()).toThrow();
	});

	it("undefined context value (key present) also throws on getExecutionId", () => {
		const state = makeState();
		state["_code_execution_context"] = undefined;
		expect("_code_execution_context" in state).toBe(true);
		const ctx = new CodeExecutorContext(state);
		expect(() => ctx.getExecutionId()).toThrow();
	});

	it("null error-count map throws on resetErrorCount `in` check", () => {
		const state = makeState();
		state["_code_executor_error_counts"] = null;
		const ctx = new CodeExecutorContext(state);
		expect(() => ctx.resetErrorCount("inv")).toThrow();
	});

	it("resetErrorCount no-ops when the invocation id is missing from a real map", () => {
		const state = makeState();
		state["_code_executor_error_counts"] = { other: 3 };
		const ctx = new CodeExecutorContext(state);
		ctx.resetErrorCount("inv");
		expect(state["_code_executor_error_counts"]).toEqual({ other: 3 });
	});

	it("null results map throws on updateCodeExecutionResult push path", () => {
		const state = makeState();
		state["_code_execution_results"] = { inv: null };
		const ctx = new CodeExecutorContext(state);
		expect(() =>
			ctx.updateCodeExecutionResult("inv", "print(1)", "1", ""),
		).toThrow();
	});

	it("missing results invocation id creates a fresh array (happy path contrast)", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.updateCodeExecutionResult("inv", "print(1)", "1", "");
		expect((ctx as any).sessionState._code_execution_results.inv).toHaveLength(
			1,
		);
	});

	it("getStateDelta throws when context is a non-JSON object like undefined", () => {
		const state = makeState();
		state["_code_execution_context"] = undefined;
		const ctx = new CodeExecutorContext(state);
		expect(() => ctx.getStateDelta()).toThrow();
	});
});
