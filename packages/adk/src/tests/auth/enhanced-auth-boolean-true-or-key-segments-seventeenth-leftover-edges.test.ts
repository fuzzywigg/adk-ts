import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Seventeenth leftover: EnhancedAuthConfig `||` key segments — sixteenth
 * keeps string `"false"` on credentialKey / scheme.type / raw type. Boolean
 * `true` is likewise truthy and stringifies into the key (vs boolean false
 * regenerate / unknown / none).
 */
describe("enhanced auth boolean-true || key segments seventeenth leftover", () => {
	it("credentialKey true is preserved by getCredentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: true as any,
		});
		expect(config.getCredentialKey()).toBe(true);
	});

	it("scheme.type true embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: true as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_true_none_\d+$/);
	});

	it("rawAuthCredential.type true embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
			rawAuthCredential: { type: true as any } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2_true_\d+$/);
	});

	it('string "false" still preserved (sixteenth control)', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "false",
		});
		expect(config.getCredentialKey()).toBe("false");
	});
});
