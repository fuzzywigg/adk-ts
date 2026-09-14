import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Eighteenth leftover: EnhancedAuthConfig `||` key segments — seventeenth
 * keeps boolean `true`; sixteenth keeps string `"false"`. String `"true"` is
 * likewise truthy and preserved / embedded (distinct from boolean true
 * stringification into generated keys).
 */
describe("enhanced auth string-true || key segments eighteenth leftover", () => {
	it('credentialKey "true" is preserved by getCredentialKey', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "true",
		});
		expect(config.getCredentialKey()).toBe("true");
	});

	it('scheme.type "true" embeds in generated key', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "true" as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_true_none_\d+$/);
	});

	it('rawAuthCredential.type "true" embeds in generated key', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
			rawAuthCredential: { type: "true" as any } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2_true_\d+$/);
	});

	it("boolean true still preserved (seventeenth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: true as any,
		});
		expect(config.getCredentialKey()).toBe(true);
	});

	it('string "false" still preserved (sixteenth control)', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "false",
		});
		expect(config.getCredentialKey()).toBe("false");
	});
});
