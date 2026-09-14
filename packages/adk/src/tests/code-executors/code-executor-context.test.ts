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

	it("reuses existing _code_execution_context from session state", () => {
		const state = State.create({}, {});
		// Underscore keys are stored on the State instance via the proxy path
		// used by CodeExecutorContext (not via State.create value dict).
		state["_code_execution_context"] = {
			execution_session_id: "preexisting",
			processed_input_files: ["seed.py"],
		};
		const context = new CodeExecutorContext(state);
		expect(context.getExecutionId()).toBe("preexisting");
		expect(context.getProcessedFileNames()).toEqual(["seed.py"]);
		context.addProcessedFileNames(["more.py"]);
		expect(context.getProcessedFileNames()).toEqual(["seed.py", "more.py"]);
	});

	it("tracks error counts independently across invocation ids", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.incrementErrorCount("a");
		context.incrementErrorCount("b");
		context.incrementErrorCount("b");
		expect(context.getErrorCount("a")).toBe(1);
		expect(context.getErrorCount("b")).toBe(2);
		expect(context.getErrorCount("c")).toBe(0);
		context.resetErrorCount("b");
		expect(context.getErrorCount("b")).toBe(0);
		expect(context.getErrorCount("a")).toBe(1);
	});

	it("resetErrorCount is a no-op for unknown ids when map exists", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.incrementErrorCount("known");
		context.resetErrorCount("unknown");
		expect(context.getErrorCount("known")).toBe(1);
		expect(context.getErrorCount("unknown")).toBe(0);
	});

	it("appends multiple input files and preserves mime metadata", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addInputFiles([
			{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
			{ name: "b.json", content: "e30=", mimeType: "application/json" },
		]);
		context.addInputFiles([
			{ name: "c.txt", content: "Yw==", mimeType: "text/plain" },
		]);
		expect(context.getInputFiles()).toEqual([
			{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
			{ name: "b.json", content: "e30=", mimeType: "application/json" },
			{ name: "c.txt", content: "Yw==", mimeType: "text/plain" },
		]);
	});

	it("clearInputFiles clears processed names only when present", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addInputFiles([
			{ name: "x.py", content: "eA==", mimeType: "text/x-python" },
		]);
		context.clearInputFiles();
		expect(context.getInputFiles()).toEqual([]);
		expect(context.getProcessedFileNames()).toEqual([]);

		context.addProcessedFileNames(["only-processed.py"]);
		context.clearInputFiles();
		expect(context.getProcessedFileNames()).toEqual([]);
	});

	it("updateCodeExecutionResult records stderr and wall-clock timestamps", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_720_000_000_500);
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.updateCodeExecutionResult("inv", "raise", "", "Traceback");
		expect(state["_code_execution_results"]["inv"][0]).toEqual({
			code: "raise",
			resultStdout: "",
			resultStderr: "Traceback",
			timestamp: 1_720_000_000,
		});
	});

	it("shares mutable session state across context instances", () => {
		const state = State.create({}, {});
		const first = new CodeExecutorContext(state);
		first.setExecutionId("shared");
		first.addInputFiles([
			{ name: "s.py", content: "cw==", mimeType: "text/x-python" },
		]);
		const second = new CodeExecutorContext(state);
		expect(second.getExecutionId()).toBe("shared");
		expect(second.getInputFiles()).toHaveLength(1);
		second.incrementErrorCount("inv-shared");
		expect(first.getErrorCount("inv-shared")).toBe(1);
	});

	it("getStateDelta includes nested processed file names snapshot", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("delta-id");
		context.addProcessedFileNames(["one.py", "two.py"]);
		const delta = context.getStateDelta();
		expect(delta).toEqual({
			_code_execution_context: {
				execution_session_id: "delta-id",
				processed_input_files: ["one.py", "two.py"],
			},
		});
	});

	it("addProcessedFileNames spreads empty arrays without changing state", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.addProcessedFileNames([]);
		expect(context.getProcessedFileNames()).toEqual([]);
		context.addProcessedFileNames(["a.py"]);
		context.addProcessedFileNames([]);
		expect(context.getProcessedFileNames()).toEqual(["a.py"]);
	});

	it("getErrorCount returns 0 for missing invocation when map is empty object", () => {
		const state = State.create({}, {});
		state["_code_executor_error_counts"] = {};
		const context = new CodeExecutorContext(state);
		expect(context.getErrorCount("missing")).toBe(0);
	});

	it("updateCodeExecutionResult appends under existing invocation key", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_000);
		const state = State.create({}, {});
		state["_code_execution_results"] = {
			inv: [
				{
					code: "old",
					resultStdout: "0",
					resultStderr: "",
					timestamp: 1,
				},
			],
		};
		const context = new CodeExecutorContext(state);
		context.updateCodeExecutionResult("inv", "new", "1", "");
		expect(state["_code_execution_results"]["inv"]).toHaveLength(2);
		expect(state["_code_execution_results"]["inv"][1].code).toBe("new");
	});

	it("setExecutionId overwrites previous session id", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		context.setExecutionId("first");
		context.setExecutionId("second");
		expect(context.getExecutionId()).toBe("second");
	});

	it("incrementErrorCount and resetErrorCount round-trip", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		expect(context.getErrorCount("inv-a")).toBe(0);
		context.incrementErrorCount("inv-a");
		context.incrementErrorCount("inv-a");
		expect(context.getErrorCount("inv-a")).toBe(2);
		context.resetErrorCount("inv-a");
		expect(context.getErrorCount("inv-a")).toBe(0);
	});

	it("getInputFileNames returns empty until files are recorded", () => {
		const state = State.create({}, {});
		const context = new CodeExecutorContext(state);
		expect(context.getProcessedFileNames()).toEqual([]);
		context.addProcessedFileNames(["a.py"]);
		expect(context.getProcessedFileNames()).toEqual(["a.py"]);
	});
});
