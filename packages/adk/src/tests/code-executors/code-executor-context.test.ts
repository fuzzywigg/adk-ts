import { describe, expect, it, vi } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

describe("CodeExecutorContext", () => {
	it("stores execution id and processed file names in context", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		expect(context.getExecutionId()).toBeNull();
		context.setExecutionId("exec-1");
		expect(context.getExecutionId()).toBe("exec-1");

		expect(context.getProcessedFileNames()).toEqual([]);
		context.addProcessedFileNames(["a.txt", "b.txt"]);
		expect(context.getProcessedFileNames()).toEqual(["a.txt", "b.txt"]);
	});

	it("tracks input files and clears them", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		context.addInputFiles([
			{ name: "in.py", content: "cHJpbnQoMSk=", mimeType: "text/x-python" },
		]);
		expect(context.getInputFiles()).toEqual([
			{ name: "in.py", content: "cHJpbnQoMSk=", mimeType: "text/x-python" },
		]);

		context.addProcessedFileNames(["in.py"]);
		context.clearInputFiles();
		expect(context.getInputFiles()).toEqual([]);
		expect(context.getProcessedFileNames()).toEqual([]);
	});

	it("increments and resets error counts per invocation", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		expect(context.getErrorCount("inv-1")).toBe(0);
		context.incrementErrorCount("inv-1");
		context.incrementErrorCount("inv-1");
		expect(context.getErrorCount("inv-1")).toBe(2);

		context.resetErrorCount("inv-1");
		expect(context.getErrorCount("inv-1")).toBe(0);
	});

	it("records code execution results and exposes state delta", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		context.setExecutionId("exec-2");
		context.updateCodeExecutionResult("inv-2", "print(1)", "1", "");

		const delta = context.getStateDelta();
		expect(delta._code_execution_context.execution_session_id).toBe("exec-2");
		expect(state["_code_execution_results"]["inv-2"]).toEqual([
			{
				code: "print(1)",
				resultStdout: "1",
				resultStderr: "",
				timestamp: 1_700_000_000,
			},
		]);
	});

	it("handles missing error-count map and appends multiple results", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		context.resetErrorCount("never-seen");
		expect(context.getErrorCount("never-seen")).toBe(0);
		expect(context.getInputFiles()).toEqual([]);

		context.updateCodeExecutionResult("inv-3", "a", "1", "");
		context.updateCodeExecutionResult("inv-3", "b", "2", "err");
		expect(state["_code_execution_results"]["inv-3"]).toHaveLength(2);
	});

	it("clearInputFiles is a no-op when no input files were stored", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		context.clearInputFiles();
		expect(context.getInputFiles()).toEqual([]);
		expect(context.getProcessedFileNames()).toEqual([]);
	});

	it("getStateDelta deep-clones context so mutations do not leak", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("exec-clone");
		context.addProcessedFileNames(["a.py"]);

		const delta = context.getStateDelta();
		delta._code_execution_context.execution_session_id = "mutated";
		delta._code_execution_context.processed_input_files.push("leaked.py");

		expect(context.getExecutionId()).toBe("exec-clone");
		expect(context.getProcessedFileNames()).toEqual(["a.py"]);
	});

	it("reuses existing context and input files from session state", () => {
		const state = State.create({}, {});
		state["_code_execution_context"] = {
			execution_session_id: "preexisting",
			processed_input_files: ["old.py"],
		};
		state["_code_executor_input_files"] = [
			{
				name: "old.py",
				content: "cHJpbnQoKSk=",
				mimeType: "text/x-python",
			},
		];
		state["_code_executor_error_counts"] = { "inv-a": 3 };

		const context = new CodeExecutorContext(state);

		expect(context.getExecutionId()).toBe("preexisting");
		expect(context.getProcessedFileNames()).toEqual(["old.py"]);
		expect(context.getInputFiles()).toHaveLength(1);
		expect(context.getErrorCount("inv-a")).toBe(3);
		expect(context.getErrorCount("missing")).toBe(0);

		context.addInputFiles([
			{ name: "new.py", content: "YQ==", mimeType: "text/x-python" },
		]);
		expect(context.getInputFiles()).toHaveLength(2);

		context.addProcessedFileNames(["new.py"]);
		expect(context.getProcessedFileNames()).toEqual(["old.py", "new.py"]);

		context.incrementErrorCount("inv-a");
		expect(context.getErrorCount("inv-a")).toBe(4);
		context.resetErrorCount("inv-a");
		expect(context.getErrorCount("inv-a")).toBe(0);
		context.resetErrorCount("inv-a");
		expect(context.getErrorCount("inv-a")).toBe(0);
	});

	it("isolates error counts and results across invocation ids", () => {
		vi.spyOn(Date, "now").mockReturnValue(2_000_000_000_000);
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);

		context.incrementErrorCount("a");
		context.incrementErrorCount("b");
		context.incrementErrorCount("b");
		expect(context.getErrorCount("a")).toBe(1);
		expect(context.getErrorCount("b")).toBe(2);

		context.updateCodeExecutionResult("a", "print(1)", "1", "");
		context.updateCodeExecutionResult("b", "raise", "", "err");
		expect(state["_code_execution_results"]["a"]).toEqual([
			{
				code: "print(1)",
				resultStdout: "1",
				resultStderr: "",
				timestamp: 2_000_000_000,
			},
		]);
		expect(state["_code_execution_results"]["b"][0].resultStderr).toBe("err");

		context.clearInputFiles();
		context.addProcessedFileNames(["x"]);
		context.clearInputFiles();
		expect(context.getProcessedFileNames()).toEqual([]);
	});
});
