import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twenty-first leftover residual deepen (complements #287 Infinity/`{}`):
 * string `"Infinity"` / `Object(1)` / `Object(false)` preserved by `||`
 * credentialKey arm; scheme.type embeds via string coercion (`Infinity` /
 * `1` / `false`).
 */
describe("enhanced auth string-infinity/object-one/object-false || key segments twenty-first residual deepen", () => {
	it('credentialKey string "Infinity" is preserved by getCredentialKey', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: "Infinity" as any,
		});
		expect(config.getCredentialKey()).toBe("Infinity");
	});

	it("credentialKey Object(1) is preserved by getCredentialKey", () => {
		const boxed = Object(1);
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: boxed as any,
		});
		expect(config.getCredentialKey()).toBe(boxed);
	});

	it("credentialKey Object(false) is preserved by getCredentialKey", () => {
		const boxed = Object(false);
		expect(Boolean(boxed)).toBe(true);
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: boxed as any,
		});
		expect(config.getCredentialKey()).toBe(boxed);
	});

	it('scheme.type string "Infinity" embeds in generated key', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "Infinity" as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_Infinity_none_\d+$/);
	});

	it("scheme.type Object(1) embeds via string coercion in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Object(1) as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_1_none_\d+$/);
	});

	it("scheme.type Object(false) embeds via string coercion in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Object(false) as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_false_none_\d+$/);
	});

	it("number Infinity still embeds (twentieth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Number.POSITIVE_INFINITY as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_Infinity_none_\d+$/);
	});
});
