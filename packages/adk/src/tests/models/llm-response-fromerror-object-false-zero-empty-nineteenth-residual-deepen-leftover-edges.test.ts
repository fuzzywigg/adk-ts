import { describe, expect, it } from "vitest";
import { LlmResponse } from "../../models/llm-response";

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * fromError `options.model || "unknown"` / `options.errorCode || "UNKNOWN_ERROR"`
 * — boxed-falsy / `"-Infinity"` / `-1` keep (model stringified into message).
 */
describe("llm-response fromError object-false/zero/empty nineteenth residual deepen", () => {
	it.each([
		{ label: "Object(false)", model: Object(false) as any, expected: "false" },
		{ label: "Object(0)", model: Object(0) as any, expected: "0" },
		{ label: 'Object("")', model: Object("") as any, expected: "" },
		{ label: "Object(NaN)", model: Object(Number.NaN) as any, expected: "NaN" },
		{
			label: 'string "-Infinity"',
			model: "-Infinity",
			expected: "-Infinity",
		},
		{ label: "number -1", model: -1 as any, expected: "-1" },
	])("model || unknown ($label)", ({ model, expected }) => {
		const resp = LlmResponse.fromError(new Error("e"), { model });
		expect(resp.errorMessage).toContain(`model ${expected}`);
	});

	it.each([
		{ label: "Object(false)", errorCode: Object(false) as any },
		{ label: "Object(0)", errorCode: Object(0) as any },
		{ label: 'Object("")', errorCode: Object("") as any },
		{ label: "Object(NaN)", errorCode: Object(Number.NaN) as any },
		{ label: 'string "-Infinity"', errorCode: "-Infinity" as any },
		{ label: "number -1", errorCode: -1 as any },
	])("errorCode || UNKNOWN_ERROR ($label) kept", ({ errorCode }) => {
		expect(LlmResponse.fromError("x", { errorCode }).errorCode).toEqual(
			errorCode,
		);
	});
});
