import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { AuthTool } from "../../auth/auth-tool";

/**
 * Eleventh leftover: plain AuthConfig processAuthRequest embeds
 * authScheme.type via template string — falsy non-string types coerce
 * into the key. Enhanced empty-string → "unknown" path already covered.
 */
describe("auth-tool plain-config falsy scheme-type eleventh leftover edges", () => {
	it.each([
		{ label: "false", type: false as any, fragment: "false" },
		{ label: "0", type: 0 as any, fragment: "0" },
		{ label: "undefined", type: undefined as any, fragment: "undefined" },
		{ label: "null", type: null as any, fragment: "null" },
		{ label: "empty string", type: "" as any, fragment: "" },
	])("embeds coerced $label scheme type in credentialKey", async ({
		type,
		fragment,
	}) => {
		const authConfig = new AuthConfig({
			authScheme: { type } as any,
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-plain",
			auth_config: authConfig,
		});
		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toMatch(new RegExp(`^adk_${fragment}_\\d+$`));
	});

	it("truthy string type still embeds literally (control)", async () => {
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-ok",
			auth_config: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
			}),
		});
		expect(result.credentialKey).toMatch(/^adk_apiKey_\d+$/);
	});
});
