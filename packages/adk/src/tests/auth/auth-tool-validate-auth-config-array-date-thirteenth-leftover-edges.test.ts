import { describe, expect, it } from "vitest";
import { AuthTool } from "../../auth/auth-tool";

/**
 * Thirteenth leftover: validateAuthArguments accepts any truthy object
 * (`typeof === "object"`), including arrays and Date. Eleventh leftover
 * only covers falsy primitives and truthy non-objects.
 */
describe("auth-tool validate auth_config array/Date thirteenth leftover", () => {
	it("array auth_config is truthy object → validates true", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: [],
			}),
		).toBe(true);
	});

	it("Date auth_config is truthy object → validates true", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: new Date(),
			}),
		).toBe(true);
	});

	it("plain object still validates (control)", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: { authScheme: { type: "apiKey" } },
			}),
		).toBe(true);
	});
});
