import { describe, expect, it } from "vitest";
import { AuthTool, EnhancedAuthConfig } from "../../auth/auth-tool";
import { AuthSchemeType } from "../../auth/auth-schemes";

/**
 * Fourteenth leftover: `args.auth_config && typeof args.auth_config ===
 * "object"` — eleventh pins falsy primitives. Arrays are objects and truthy,
 * so `auth_config: []` passes validate; `auth_config: null` fails.
 */
describe("auth-tool auth_config array-object truthy fourteenth leftover", () => {
	it("array auth_config passes validateAuthArguments", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: [],
			}),
		).toBe(true);
	});

	it("Date auth_config passes (object truthy)", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: new Date(0),
			}),
		).toBe(true);
	});

	it("null auth_config still fails via && short-circuit (eleventh control)", () => {
		// `args.auth_config && …` returns null (falsy), not boolean false
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: null,
			}),
		).toBeFalsy();
	});

	it("processAuthRequest with EnhancedAuthConfig still returns key", async () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: AuthSchemeType.APIKEY } as any,
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-1",
			auth_config: config,
		});
		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toMatch(/^adk_/);
	});
});
