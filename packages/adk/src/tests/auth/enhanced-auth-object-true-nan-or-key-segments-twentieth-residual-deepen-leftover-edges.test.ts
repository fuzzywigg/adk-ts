import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twentieth leftover residual deepen (complements #287 {}/Infinity ||
 * key segments): `Object(true)` is truthy and preserved / embeds as
 * `"true"`; `NaN` is falsy → coalesces to generateCredentialKey /
 * `"unknown"` scheme segment (asymmetry vs Infinity keep).
 */
describe("enhanced auth object-true/NaN || key segments twentieth residual deepen", () => {
	it("credentialKey Object(true) is preserved by getCredentialKey", () => {
		const boxed = Object(true) as any;
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: boxed,
		});
		expect(config.getCredentialKey()).toBe(boxed);
		expect(String(config.getCredentialKey())).toBe("true");
	});

	it('scheme.type Object(true) embeds as "true" in generated key', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Object(true) as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_true_none_\d+$/);
	});

	it("credentialKey NaN is falsy → generates fresh key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: Number.NaN as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
		expect(Number.isNaN(config.getCredentialKey() as any)).toBe(false);
	});

	it('scheme.type NaN coalesces to "unknown" segment', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Number.NaN as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_unknown_none_\d+$/);
	});

	it("credentialKey Infinity still preserved (twentieth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: Number.POSITIVE_INFINITY as any,
		});
		expect(config.getCredentialKey()).toBe(Number.POSITIVE_INFINITY);
	});
});
