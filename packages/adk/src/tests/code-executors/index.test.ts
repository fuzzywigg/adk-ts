import { describe, expect, it } from "vitest";
import {
	BaseCodeExecutor,
	BuiltInCodeExecutor,
	CodeExecutionUtils,
	CodeExecutorContext,
} from "../../code-executors";

describe("code-executors barrel exports", () => {
	it("re-exports core executor types and utilities", () => {
		expect(BuiltInCodeExecutor).toBeTypeOf("function");
		expect(CodeExecutorContext).toBeTypeOf("function");
		expect(CodeExecutionUtils).toBeTypeOf("function");
		expect(BaseCodeExecutor).toBeTypeOf("function");
		expect(
			CodeExecutionUtils.buildExecutableCodePart("x").executableCode?.code,
		).toBe("x");
	});
});
