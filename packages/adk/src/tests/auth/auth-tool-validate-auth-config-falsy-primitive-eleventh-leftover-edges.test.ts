import { describe, expect, it } from "vitest";
import { AuthTool } from "../../auth/auth-tool";

/**
 * Eleventh leftover: validateAuthArguments uses auth_config && typeof ===
 * "object" — falsy primitives short-circuit to the falsy value itself
 * (not boolean false), except false → false. null already covered.
 */
describe("auth-tool validate auth_config falsy-primitive eleventh leftover edges", () => {
	it.each([
		{ label: "false", auth_config: false, expected: false },
		{ label: "0", auth_config: 0, expected: 0 },
		{ label: "empty string", auth_config: "", expected: "" },
		{ label: "NaN", auth_config: Number.NaN, expected: Number.NaN },
	])("&& short-circuits to $label ($expected) not boolean false", ({
		auth_config,
		expected,
	}) => {
		const result = AuthTool.validateAuthArguments({
			function_call_id: "fc-1",
			auth_config,
		});
		expect(result).toBeFalsy();
		if (Number.isNaN(expected as number)) {
			expect(Number.isNaN(result as number)).toBe(true);
		} else {
			expect(result).toBe(expected);
		}
	});

	it("truthy non-object auth_config also fails typeof check", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: "config",
			}),
		).toBe(false);
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: 1,
			}),
		).toBe(false);
	});

	it("truthy plain object still validates (control)", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: { authScheme: { type: "apiKey" } },
			}),
		).toBe(true);
	});
});
