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
});
