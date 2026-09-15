import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twentieth leftover: EnhancedAuthConfig `||` key segments — nineteenth
 * keeps number `1` / empty array `[]`; eighteenth keeps string `"true"`.
 * Empty object `{}` and `Infinity` are likewise truthy and preserved /
 * embedded (not coalesced to generateCredentialKey).
 */
describe("enhanced auth empty-object / Infinity || key segments twentieth leftover", () => {
	it("credentialKey {} is preserved by getCredentialKey", () => {
		const empty: any = {};
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: empty,
		});
		expect(config.getCredentialKey()).toBe(empty);
		expect(typeof config.getCredentialKey()).toBe("object");
	});

	it("credentialKey Infinity is preserved by getCredentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: Number.POSITIVE_INFINITY as any,
		});
		expect(config.getCredentialKey()).toBe(Number.POSITIVE_INFINITY);
	});

	it("scheme.type Infinity embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Number.POSITIVE_INFINITY as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_Infinity_none_\d+$/);
	});

	it("scheme.type {} embeds via string coercion in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: {} as any },
		});
		expect(config.getCredentialKey()).toMatch(
			/^adk_\[object Object\]_none_\d+$/,
		);
	});

	it("number 1 still preserved (nineteenth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: 1 as any,
		});
		expect(config.getCredentialKey()).toBe(1);
	});

	it("empty array [] still preserved (nineteenth control)", () => {
		const empty: any = [];
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: empty,
		});
		expect(config.getCredentialKey()).toBe(empty);
	});
});
