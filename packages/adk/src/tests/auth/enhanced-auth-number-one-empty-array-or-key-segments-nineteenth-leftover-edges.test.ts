import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Nineteenth leftover: EnhancedAuthConfig `||` key segments — eighteenth
 * keeps string `"true"`; seventeenth keeps boolean `true`. Number `1` and
 * empty array `[]` are likewise truthy and preserved / embedded (not
 * coalesced to generateCredentialKey).
 */
describe("enhanced auth number-one / empty-array || key segments nineteenth leftover", () => {
	it("credentialKey number 1 is preserved by getCredentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: 1 as any,
		});
		expect(config.getCredentialKey()).toBe(1);
	});

	it("credentialKey [] is preserved by getCredentialKey", () => {
		const empty: any = [];
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: empty,
		});
		expect(config.getCredentialKey()).toBe(empty);
		expect(Array.isArray(config.getCredentialKey())).toBe(true);
	});

	it("scheme.type number 1 embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: 1 as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_1_none_\d+$/);
	});

	it('string "true" still preserved (eighteenth control)', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "true",
		});
		expect(config.getCredentialKey()).toBe("true");
	});

	it("boolean true still preserved (seventeenth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: true as any,
		});
		expect(config.getCredentialKey()).toBe(true);
	});
});
