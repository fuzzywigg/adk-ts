import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Eighteenth leftover: EnhancedAuthConfig `||` key segments — seventeenth
 * keeps boolean `true`. Empty array `[]` is likewise truthy; Array stringifies
 * to "" so generated keys collapse adjacent underscores (`adk__none_…`).
 */
describe("enhanced auth empty-array || key segments eighteenth leftover", () => {
	it("credentialKey [] is preserved by getCredentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: [] as any,
		});
		expect(config.getCredentialKey()).toEqual([]);
	});

	it("scheme.type [] embeds as empty segment in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: [] as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk__none_\d+$/);
	});

	it("rawAuthCredential.type [] embeds as empty segment", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
			rawAuthCredential: { type: [] as any } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2__\d+$/);
	});

	it("credentialKey {} is preserved (truthy object twin)", () => {
		const key = {} as any;
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: key,
		});
		expect(config.getCredentialKey()).toBe(key);
	});

	it("boolean true still preserved (seventeenth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: true as any,
		});
		expect(config.getCredentialKey()).toBe(true);
	});
});
