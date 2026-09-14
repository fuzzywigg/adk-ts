import { describe, expect, it } from "vitest";
import { AuthTool } from "../../auth/auth-tool";

/**
 * Thirteenth leftover: validateAuthArguments only checks
 * `typeof function_call_id === "string"` — empty and whitespace ids pass.
 * Distinct from eleventh falsy auth_config && short-circuit.
 */
describe("auth-tool function_call_id empty/whitespace thirteenth leftover", () => {
	it.each([
		{ label: "empty", id: "" },
		{ label: "space", id: " " },
		{ label: "tabs", id: "\t\t" },
		{ label: "newline", id: "\n" },
		{ label: "string 0", id: "0" },
	])("accepts $label function_call_id as valid string", ({ id }) => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: id,
				auth_config: { authScheme: { type: "apiKey" } },
			}),
		).toBe(true);
	});

	it.each([
		{ label: "number 0", id: 0 },
		{ label: "false", id: false },
		{ label: "null", id: null },
		{ label: "undefined", id: undefined },
	])("rejects non-string function_call_id ($label)", ({ id }) => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: id as any,
				auth_config: { authScheme: { type: "apiKey" } },
			}),
		).toBe(false);
	});
});
