import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twelfth leftover: ctor and getCredentialKey both use `credentialKey || generate`.
 * Existing leftovers pin `""` regenerate and `"   "` keep. `0` / `false` / `NaN`
 * are also falsy after assignment; string `"0"` stays.
 */
describe("enhanced auth getCredentialKey falsy 0/false twelfth leftover", () => {
	it.each([
		{ label: "0", value: 0 as any },
		{ label: "false", value: false as any },
		{ label: "NaN", value: Number.NaN as any },
	])("getCredentialKey regenerates after credentialKey=$label", ({ value }) => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "keep-me",
		});
		config.credentialKey = value;
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});

	it('string "0" is truthy and preserved', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "0",
		});
		expect(config.getCredentialKey()).toBe("0");
	});

	it("ctor credentialKey 0 falls through to generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "http" } as any,
			credentialKey: 0 as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_http_none_\d+$/);
	});
});
