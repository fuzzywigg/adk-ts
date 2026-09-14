import { describe, expect, it, vi } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

describe("CodeExecutorContext heavy matrix leftover edges", () => {
	it("initializes empty context bag on first construction", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		expect(context.getExecutionId()).toBeNull();
		expect(context.getProcessedFileNames()).toEqual([]);
		expect(context.getInputFiles()).toEqual([]);
		expect(context.getErrorCount("any")).toBe(0);
		const delta = context.getStateDelta();
		expect(delta).toHaveProperty("_code_execution_context");
		expect(delta._code_execution_context).toEqual({});
	});

	it("setExecutionId overwrites prior id", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("first");
		context.setExecutionId("second");
		expect(context.getExecutionId()).toBe("second");
	});

	it("addProcessedFileNames appends and preserves duplicates", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addProcessedFileNames(["a.py"]);
		context.addProcessedFileNames(["a.py", "b.py"]);
		expect(context.getProcessedFileNames()).toEqual(["a.py", "a.py", "b.py"]);
	});

	it("addProcessedFileNames with empty array is a no-op append", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addProcessedFileNames([]);
		expect(context.getProcessedFileNames()).toEqual([]);
		context.addProcessedFileNames(["x"]);
		context.addProcessedFileNames([]);
		expect(context.getProcessedFileNames()).toEqual(["x"]);
	});

	it("getStateDelta deep clones nested arrays", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addProcessedFileNames(["seed"]);
		const delta = context.getStateDelta();
		delta._code_execution_context.processed_input_files.push("leaked");
		expect(context.getProcessedFileNames()).toEqual(["seed"]);
	});

	it("clearInputFiles clears processed names only when context key exists", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.clearInputFiles();
		expect(context.getProcessedFileNames()).toEqual([]);
		context.addProcessedFileNames(["p"]);
		context.clearInputFiles();
		expect(context.getProcessedFileNames()).toEqual([]);
	});

	it("addInputFiles creates session-level array and appends metadata", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addInputFiles([
			{ name: "a.py", content: "YQ==", mimeType: "text/x-python" },
		]);
		expect(context.getInputFiles()).toEqual([
			{ name: "a.py", content: "YQ==", mimeType: "text/x-python" },
		]);
		context.addInputFiles([
			{ name: "b.csv", content: "Yg==", mimeType: "text/csv" },
		]);
		expect(context.getInputFiles()).toHaveLength(2);
	});

	it("clearInputFiles empties input files but leaves other session keys", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		state["keep"] = true;
		context.addInputFiles([
			{ name: "x", content: "eA==", mimeType: "text/plain" },
		]);
		context.clearInputFiles();
		expect(context.getInputFiles()).toEqual([]);
		expect(state["keep"]).toBe(true);
	});

	it("error counts are independent per invocation id", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.incrementErrorCount("a");
		context.incrementErrorCount("a");
		context.incrementErrorCount("b");
		expect(context.getErrorCount("a")).toBe(2);
		expect(context.getErrorCount("b")).toBe(1);
		expect(context.getErrorCount("c")).toBe(0);
	});

	it("resetErrorCount removes only the targeted invocation", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.incrementErrorCount("keep");
		context.incrementErrorCount("drop");
		context.resetErrorCount("drop");
		expect(context.getErrorCount("keep")).toBe(1);
		expect(context.getErrorCount("drop")).toBe(0);
	});

	it("resetErrorCount is a no-op when map missing or id unknown", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.resetErrorCount("never");
		context.incrementErrorCount("known");
		context.resetErrorCount("unknown");
		expect(context.getErrorCount("known")).toBe(1);
	});

	it("updateCodeExecutionResult appends entries with floor timestamp", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_999);
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.updateCodeExecutionResult("inv", "print(1)", "1", "");
		context.updateCodeExecutionResult("inv", "print(2)", "2", "err");
		expect(state["_code_execution_results"].inv).toEqual([
			{
				code: "print(1)",
				resultStdout: "1",
				resultStderr: "",
				timestamp: 1_700_000_000,
			},
			{
				code: "print(2)",
				resultStdout: "2",
				resultStderr: "err",
				timestamp: 1_700_000_000,
			},
		]);
		vi.restoreAllMocks();
	});

	it("updateCodeExecutionResult isolates invocations", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.updateCodeExecutionResult("a", "a", "1", "");
		context.updateCodeExecutionResult("b", "b", "2", "");
		expect(Object.keys(state["_code_execution_results"]).sort()).toEqual([
			"a",
			"b",
		]);
	});

	it("reuses preexisting underscore context from session state", () => {
		const state = State.create({}, {});
		state["_code_execution_context"] = {
			execution_session_id: "pre",
			processed_input_files: ["seed"],
		};
		const context = new CodeExecutorContext(state);
		expect(context.getExecutionId()).toBe("pre");
		expect(context.getProcessedFileNames()).toEqual(["seed"]);
	});

	it("empty-string execution id is distinct from null missing id", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("");
		expect(context.getExecutionId()).toBe("");
	});

	it("getErrorCount returns 0 for missing invocation when map exists", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.incrementErrorCount("x");
		expect(context.getErrorCount("y")).toBe(0);
	});

	it("input files survive across multiple context wrappers on same state", () => {
		const state = State.create({}, {});
		const first = new CodeExecutorContext(state);
		first.addInputFiles([
			{ name: "shared.py", content: "cw==", mimeType: "text/x-python" },
		]);
		const second = new CodeExecutorContext(state);
		expect(second.getInputFiles()).toEqual([
			{ name: "shared.py", content: "cw==", mimeType: "text/x-python" },
		]);
	});

	it("execution results live on session state not context delta key", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("exec");
		context.updateCodeExecutionResult("inv", "code", "out", "err");
		const delta = context.getStateDelta();
		expect(delta._code_execution_context.execution_session_id).toBe("exec");
		expect(delta._code_execution_results).toBeUndefined();
		expect(state["_code_execution_results"].inv).toHaveLength(1);
	});
});
