import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Sixteenth leftover: EnhancedAuthConfig `||` key segments — twelfth keeps
 * credentialKey/`scheme.type` string `"0"`; thirteenth keeps raw type `"0"`.
 * String `"false"` is likewise truthy on all three gates (vs boolean false
 * regenerate / unknown / none).
 */
describe("enhanced auth string-false || key segments sixteenth leftover", () => {
	it('credentialKey "false" is preserved by getCredentialKey', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "false",
		});
		expect(config.getCredentialKey()).toBe("false");
	});

	it('scheme.type "false" embeds in generated key', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "false" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_false_none_\d+$/);
	});

	it('rawAuthCredential.type "false" embeds in generated key', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
			rawAuthCredential: { type: "false" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2_false_\d+$/);
	});

	it("boolean false scheme type still falls to unknown (twelfth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: false as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_unknown_none_\d+$/);
	});
});
