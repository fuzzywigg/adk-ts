import { describe, expect, it } from "vitest";
import { LlmResponse } from "../../models/llm-response";

/**
 * Thirteenth leftover: fromError `options.model || "unknown"` and
 * `options.errorCode || "UNKNOWN_ERROR"` — leftover matrices pin "" → unknown
 * but not whitespace / "0" / false / 0.
 */
describe("llm-response fromError whitespace model thirteenth leftover edges", () => {
	it("whitespace model is kept (truthy ||)", () => {
		const resp = LlmResponse.fromError(new Error("e"), { model: " " });
		expect(resp.errorMessage).toContain("model  : e");
	});

	it.each([
		{ label: "empty", model: "", expected: "unknown" },
		{ label: "0 number", model: 0 as any, expected: "unknown" },
		{ label: "false", model: false as any, expected: "unknown" },
		{ label: "null", model: null as any, expected: "unknown" },
	])("$label model coalesces to unknown", ({ model, expected }) => {
		const resp = LlmResponse.fromError(new Error("e"), { model });
		expect(resp.errorMessage).toContain(`model ${expected}`);
	});

	it('string "0" model is kept', () => {
		const resp = LlmResponse.fromError(new Error("e"), { model: "0" });
		expect(resp.errorMessage).toContain("model 0: e");
	});

	it("whitespace errorCode is kept vs empty → UNKNOWN_ERROR", () => {
		expect(LlmResponse.fromError("x", { errorCode: " " }).errorCode).toBe(" ");
		expect(LlmResponse.fromError("x", { errorCode: "" }).errorCode).toBe(
			"UNKNOWN_ERROR",
		);
		expect(LlmResponse.fromError("x", { errorCode: "0" }).errorCode).toBe("0");
		expect(LlmResponse.fromError("x", { errorCode: 0 as any }).errorCode).toBe(
			"UNKNOWN_ERROR",
		);
	});
});
