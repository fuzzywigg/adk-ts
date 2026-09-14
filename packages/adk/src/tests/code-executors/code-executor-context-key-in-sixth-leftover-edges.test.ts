import { describe, expect, it } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

function makeState(seed: Record<string, any> = {}): State {
	return State.create(seed, {});
}

/**
 * Leftover distinct from #168 errorCount nullish: `key in object` treats
 * present-undefined / present-null differently from missing keys for
 * getExecutionId and getProcessedFileNames / getInputFiles.
 */
describe("CodeExecutorContext sixth leftover: key-in vs missing coalesce", () => {
	it("execution_session_id present as undefined returns undefined not null", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			execution_session_id: undefined,
		};
		const ctx = new CodeExecutorContext(state);
		expect("execution_session_id" in state["_code_execution_context"]).toBe(
			true,
		);
		expect(ctx.getExecutionId()).toBeUndefined();
	});

	it("execution_session_id present as null returns null (not missing-null)", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			execution_session_id: null,
		};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getExecutionId()).toBeNull();
	});

	it("missing execution_session_id returns null via !in branch", () => {
		const state = makeState();
		state["_code_execution_context"] = {};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getExecutionId()).toBeNull();
	});

	it("processed_input_files present as undefined bypasses [] default", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			processed_input_files: undefined,
		};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getProcessedFileNames()).toBeUndefined();
	});

	it("processed_input_files present as null bypasses [] default", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			processed_input_files: null,
		};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getProcessedFileNames()).toBeNull();
	});

	it("processed_input_files missing returns []", () => {
		const ctx = new CodeExecutorContext(makeState());
		expect(ctx.getProcessedFileNames()).toEqual([]);
	});

	it("addProcessedFileNames after null seed throws when pushing", () => {
		const state = makeState();
		state["_code_execution_context"] = {
			processed_input_files: null,
		};
		const ctx = new CodeExecutorContext(state);
		expect(() => ctx.addProcessedFileNames(["a.py"])).toThrow();
	});

	it("getInputFiles with null seed throws on .map", () => {
		const state = makeState();
		state["_code_executor_input_files"] = null;
		const ctx = new CodeExecutorContext(state);
		expect(() => ctx.getInputFiles()).toThrow();
	});

	it("getInputFiles missing key returns []", () => {
		const ctx = new CodeExecutorContext(makeState());
		expect(ctx.getInputFiles()).toEqual([]);
	});

	it("clearInputFiles no-ops when keys absent", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.clearInputFiles();
		expect(state["_code_executor_input_files"]).toBeUndefined();
		expect(
			state["_code_execution_context"].processed_input_files,
		).toBeUndefined();
	});

	it("clearInputFiles empties existing arrays without deleting keys", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([{ name: "a.csv", content: "x", mimeType: "text/csv" }]);
		ctx.addProcessedFileNames(["a.csv"]);
		ctx.clearInputFiles();
		expect(state["_code_executor_input_files"]).toEqual([]);
		expect(state["_code_execution_context"].processed_input_files).toEqual([]);
	});

	it("getStateDelta deep-copies context (mutation isolation)", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.setExecutionId("sess-1");
		const delta = ctx.getStateDelta();
		delta["_code_execution_context"].execution_session_id = "mutated";
		expect(ctx.getExecutionId()).toBe("sess-1");
	});

	it("updateCodeExecutionResult appends under invocation id", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.updateCodeExecutionResult("inv-1", "print(1)", "1", "");
		ctx.updateCodeExecutionResult("inv-1", "print(2)", "2", "");
		const results = (ctx as any).sessionState._code_execution_results["inv-1"];
		expect(results).toHaveLength(2);
		expect(results[0].code).toBe("print(1)");
		expect(results[1].resultStdout).toBe("2");
	});
});
