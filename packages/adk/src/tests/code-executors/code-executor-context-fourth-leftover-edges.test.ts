import { describe, expect, it, vi } from "vitest";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";
import { State } from "../../sessions/state";

function makeState(seed: Record<string, any> = {}): State {
	return State.create(seed, {});
}

describe("CodeExecutorContext fourth leftover coalesce / mutation matrices", () => {
	const invocationIds = [
		"",
		"a",
		"inv-0",
		"inv-with-dashes",
		"unicode-ä",
		"x".repeat(40),
	];

	for (const id of invocationIds) {
		it(`error count coalesce lifecycle for ${JSON.stringify(id)}`, () => {
			const ctx = new CodeExecutorContext(makeState());
			expect(ctx.getErrorCount(id)).toBe(0);
			ctx.incrementErrorCount(id);
			expect(ctx.getErrorCount(id)).toBe(1);
			ctx.incrementErrorCount(id);
			ctx.incrementErrorCount(id);
			expect(ctx.getErrorCount(id)).toBe(3);
			ctx.resetErrorCount(id);
			expect(ctx.getErrorCount(id)).toBe(0);
		});
	}

	it("getErrorCount ?? 0 when map exists but id absent", () => {
		const state = makeState();
		state["_code_executor_error_counts"] = { other: 4 };
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getErrorCount("missing")).toBe(0);
		expect(ctx.getErrorCount("other")).toBe(4);
	});

	it("resetErrorCount early-returns when map never created", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.resetErrorCount("ghost");
		expect(state["_code_executor_error_counts"]).toBeUndefined();
	});

	it("resetErrorCount no-ops for absent id when map exists", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.incrementErrorCount("keep");
		ctx.resetErrorCount("absent");
		expect(ctx.getErrorCount("keep")).toBe(1);
		expect("absent" in state["_code_executor_error_counts"]).toBe(false);
	});

	it("error counts stay independent across many ids", () => {
		const ctx = new CodeExecutorContext(makeState());
		for (let i = 0; i < 5; i++) {
			for (let j = 0; j <= i; j++) {
				ctx.incrementErrorCount(`id-${i}`);
			}
		}
		for (let i = 0; i < 5; i++) {
			expect(ctx.getErrorCount(`id-${i}`)).toBe(i + 1);
		}
		ctx.resetErrorCount("id-2");
		expect(ctx.getErrorCount("id-2")).toBe(0);
		expect(ctx.getErrorCount("id-3")).toBe(4);
	});

	const sessionIds = [null as any, undefined as any, "", "sess-1", "sess-2"];
	for (const [i, seed] of sessionIds.entries()) {
		it(`execution id get/set matrix #${i}`, () => {
			const state = makeState();
			if (seed !== null && seed !== undefined) {
				state["_code_execution_context"] = {
					execution_session_id: seed,
				};
			}
			const ctx = new CodeExecutorContext(state);
			if (seed === null || seed === undefined) {
				expect(ctx.getExecutionId()).toBeNull();
			} else {
				expect(ctx.getExecutionId()).toBe(seed);
			}
			ctx.setExecutionId(`set-${i}`);
			expect(ctx.getExecutionId()).toBe(`set-${i}`);
		});
	}

	it("empty-string execution id is distinct from missing null", () => {
		const ctx = new CodeExecutorContext(makeState());
		expect(ctx.getExecutionId()).toBeNull();
		ctx.setExecutionId("");
		expect(ctx.getExecutionId()).toBe("");
	});

	const fileBatches = [
		[],
		[{ name: "a.csv", content: "YQ==", mimeType: "text/csv" }],
		[
			{ name: "a.csv", content: "YQ==", mimeType: "text/csv" },
			{ name: "b.txt", content: "Yg==", mimeType: "text/plain" },
		],
		[
			{ name: "x.py", content: "eA==", mimeType: "text/x-python" },
			{ name: "y.json", content: "e30=", mimeType: "application/json" },
			{ name: "z.bin", content: "AA==", mimeType: "application/octet-stream" },
		],
	];

	for (const [i, files] of fileBatches.entries()) {
		it(`input file add/get/clear batch #${i}`, () => {
			const ctx = new CodeExecutorContext(makeState());
			expect(ctx.getInputFiles()).toEqual([]);
			ctx.addInputFiles(files);
			expect(ctx.getInputFiles()).toEqual(files);
			ctx.clearInputFiles();
			expect(ctx.getInputFiles()).toEqual([]);
		});
	}

	it("addInputFiles appends across calls without replacing", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.addInputFiles([
			{ name: "1.txt", content: "MQ==", mimeType: "text/plain" },
		]);
		ctx.addInputFiles([
			{ name: "2.txt", content: "Mg==", mimeType: "text/plain" },
		]);
		expect(ctx.getInputFiles().map((f) => f.name)).toEqual(["1.txt", "2.txt"]);
	});

	it("addInputFiles empty array creates key when first call", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([]);
		expect(state["_code_executor_input_files"]).toEqual([]);
		expect(ctx.getInputFiles()).toEqual([]);
	});

	const processedBatches = [[], ["a"], ["a", "b"], ["a", "a", "c"]];
	for (const [i, names] of processedBatches.entries()) {
		it(`processed file names batch #${i}`, () => {
			const ctx = new CodeExecutorContext(makeState());
			ctx.addProcessedFileNames(names);
			expect(ctx.getProcessedFileNames()).toEqual(names);
		});
	}

	it("processed names accumulate then clear with clearInputFiles", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.addProcessedFileNames(["p1"]);
		ctx.addProcessedFileNames(["p2", "p3"]);
		expect(ctx.getProcessedFileNames()).toEqual(["p1", "p2", "p3"]);
		ctx.clearInputFiles();
		expect(ctx.getProcessedFileNames()).toEqual([]);
	});

	it("clearInputFiles no-ops processed key when never set", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.clearInputFiles();
		expect("processed_input_files" in state["_code_execution_context"]).toBe(
			false,
		);
		expect(ctx.getProcessedFileNames()).toEqual([]);
	});

	it("clearInputFiles leaves unrelated session keys intact", () => {
		const state = makeState();
		state["keep_me"] = { nested: true };
		const ctx = new CodeExecutorContext(state);
		ctx.addInputFiles([{ name: "t", content: "dA==", mimeType: "text/plain" }]);
		ctx.clearInputFiles();
		expect(state["keep_me"]).toEqual({ nested: true });
	});

	const resultRows = [
		{ inv: "i1", code: "print(1)", out: "1", err: "" },
		{ inv: "i1", code: "print(2)", out: "", err: "boom" },
		{ inv: "i2", code: "x=1", out: "", err: "" },
		{ inv: "", code: "", out: "", err: "e" },
	];

	it("updateCodeExecutionResult appends per invocation with floor timestamps", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_123_456);
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		for (const row of resultRows) {
			ctx.updateCodeExecutionResult(row.inv, row.code, row.out, row.err);
		}
		expect(state["_code_execution_results"].i1).toHaveLength(2);
		expect(state["_code_execution_results"].i1[0]).toEqual({
			code: "print(1)",
			resultStdout: "1",
			resultStderr: "",
			timestamp: 1_700_000_123,
		});
		expect(state["_code_execution_results"].i1[1].resultStderr).toBe("boom");
		expect(state["_code_execution_results"].i2).toHaveLength(1);
		expect(state["_code_execution_results"][""]).toHaveLength(1);
		vi.restoreAllMocks();
	});

	it("getStateDelta deep clones nested context", () => {
		const ctx = new CodeExecutorContext(makeState());
		ctx.setExecutionId("clone-me");
		ctx.addProcessedFileNames(["f1"]);
		const delta = ctx.getStateDelta();
		delta._code_execution_context.execution_session_id = "mutated";
		delta._code_execution_context.processed_input_files.push("leak");
		expect(ctx.getExecutionId()).toBe("clone-me");
		expect(ctx.getProcessedFileNames()).toEqual(["f1"]);
	});

	it("getStateDelta does not include error counts or results keys", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		ctx.setExecutionId("e");
		ctx.incrementErrorCount("inv");
		ctx.updateCodeExecutionResult("inv", "c", "o", "");
		const delta = ctx.getStateDelta();
		expect(Object.keys(delta)).toEqual(["_code_execution_context"]);
		expect(delta._code_executor_error_counts).toBeUndefined();
		expect(delta._code_execution_results).toBeUndefined();
	});

	it("reuses preexisting context object from session state", () => {
		const state = makeState();
		const bag = {
			execution_session_id: "pre",
			processed_input_files: ["seed"],
		};
		state["_code_execution_context"] = bag;
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getExecutionId()).toBe("pre");
		ctx.setExecutionId("post");
		expect(bag.execution_session_id).toBe("post");
	});

	it("two wrappers on same state share input files and error map", () => {
		const state = makeState();
		const a = new CodeExecutorContext(state);
		a.addInputFiles([
			{ name: "shared.py", content: "cw==", mimeType: "text/x-python" },
		]);
		a.incrementErrorCount("shared");
		const b = new CodeExecutorContext(state);
		expect(b.getInputFiles()).toHaveLength(1);
		expect(b.getErrorCount("shared")).toBe(1);
		b.incrementErrorCount("shared");
		expect(a.getErrorCount("shared")).toBe(2);
	});

	it("getProcessedFileNames returns [] when key absent after construction", () => {
		const state = makeState();
		state["_code_execution_context"] = {};
		const ctx = new CodeExecutorContext(state);
		expect(ctx.getProcessedFileNames()).toEqual([]);
	});

	it("addProcessedFileNames creates array on first push", () => {
		const state = makeState();
		const ctx = new CodeExecutorContext(state);
		expect("processed_input_files" in state["_code_execution_context"]).toBe(
			false,
		);
		ctx.addProcessedFileNames(["first"]);
		expect(state["_code_execution_context"].processed_input_files).toEqual([
			"first",
		]);
	});
});
