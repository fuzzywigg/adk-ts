import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #242):
 * EnhancedAuthConfig `||` key segments — eighteenth pins string `"true"`;
 * seventeenth pins boolean `true`. Number `1` is likewise truthy and
 * preserved / embedded (distinct from string `"1"` and falsy `0` regenerate).
 */
describe("enhanced auth number-one || key segments eighteenth leftover", () => {
	it("credentialKey 1 is preserved by getCredentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: 1 as any,
		});
		expect(config.getCredentialKey()).toBe(1);
	});

	it("scheme.type 1 embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: 1 as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_1_none_\d+$/);
	});

	it("rawAuthCredential.type 1 embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
			rawAuthCredential: { type: 1 as any } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2_1_\d+$/);
	});

	it('string "true" still preserved (eighteenth control)', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "true",
		});
		expect(config.getCredentialKey()).toBe("true");
	});

	it("numeric 0 still regenerates (twelfth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: 0 as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});
});
