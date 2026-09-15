import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after providers #269 / tip `03ff90a` / #258):
 * EnhancedAuthConfig `||` key segments — nineteenth keeps number `1` / `[]`;
 * eighteenth keeps string `"true"`. Empty object `{}` and `Infinity` are
 * likewise truthy and preserved; `-0` is falsy → generateCredentialKey arm.
 */
describe("enhanced auth empty-object / Infinity / negzero || key segments twentieth leftover", () => {
	it("credentialKey {} is preserved by getCredentialKey", () => {
		const empty: any = {};
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: empty,
		});
		expect(config.getCredentialKey()).toBe(empty);
	});

	it("credentialKey Infinity is preserved by getCredentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: Number.POSITIVE_INFINITY as any,
		});
		expect(config.getCredentialKey()).toBe(Number.POSITIVE_INFINITY);
	});

	it("credentialKey -0 falls through to generateCredentialKey", () => {
		expect(!!-0).toBe(false);
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: -0 as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});

	it("scheme.type Infinity embeds in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: Number.POSITIVE_INFINITY as any },
		});
		expect(config.getCredentialKey()).toMatch(/^adk_Infinity_none_\d+$/);
	});

	it("number 1 still preserved (nineteenth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: 1 as any,
		});
		expect(config.getCredentialKey()).toBe(1);
	});
});
