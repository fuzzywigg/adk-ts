import { describe, expect, it } from "vitest";
import { BaseCodeExecutor } from "../../code-executors/base-code-executor";
import { CodeExecutorContext } from "../../code-executors/code-executor-context";

class TestExecutor extends BaseCodeExecutor {
	async executeCode() {
		return { stdout: "", stderr: "", outputFiles: [] };
	}
}

/**
 * Nineteenth leftover (code-executors residual): `??` keeps ""/NaN;
 * errorCounts `?? 0` keeps stored "".
 */
describe("code-executors nullish-keep nineteenth leftover", () => {
	it("errorRetryAttempts empty-string is kept via ??", () => {
		const ex = new TestExecutor({ errorRetryAttempts: "" as any });
		expect(ex.errorRetryAttempts).toBe("");
	});

	it("errorRetryAttempts NaN is kept via ??", () => {
		const ex = new TestExecutor({ errorRetryAttempts: Number.NaN as any });
		expect(Number.isNaN(ex.errorRetryAttempts)).toBe(true);
	});

	it("optimizeDataFile/stateful empty-string kept via ??", () => {
		const ex = new TestExecutor({
			optimizeDataFile: "" as any,
			stateful: "" as any,
		});
		expect(
			(ex as any).optimizeDataFile ?? (ex as any).config?.optimizeDataFile,
		).toBe("");
		expect((ex as any).stateful ?? (ex as any).config?.stateful).toBe("");
	});

	it('getErrorCount returns stored "" via ?? (not coalesced to 0)', () => {
		const state: Record<string, any> = {};
		state["_code_executor_error_counts"] = { inv: "" };
		const ctx = new CodeExecutorContext(state as any);
		expect(ctx.getErrorCount("inv")).toBe("");
	});

	it("getErrorCount null entry coalesces to 0", () => {
		const state: Record<string, any> = {};
		state["_code_executor_error_counts"] = { inv: null };
		const ctx = new CodeExecutorContext(state as any);
		expect(ctx.getErrorCount("inv")).toBe(0);
	});
});
