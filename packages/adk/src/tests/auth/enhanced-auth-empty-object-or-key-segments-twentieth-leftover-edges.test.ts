import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twentieth leftover: EnhancedAuthConfig `||` key segments — nineteenth
 * keeps number `1` / `[]`; eighteenth keeps string `"true"`. Empty object
 * `{}` is likewise truthy and preserved / embedded (not coalesced to
 * generateCredentialKey); `scheme.type: {}` stringifies to `[object Object]`.
 */
describe("enhanced auth empty-object || key segments twentieth leftover", () => {
	it("credentialKey {} is preserved by getCredentialKey", () => {
		const empty: any = {};
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: empty,
		});
		expect(config.getCredentialKey()).toBe(empty);
		expect(typeof config.getCredentialKey()).toBe("object");
	});

	it("scheme.type {} embeds [object Object] in generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: {} as any },
		});
		expect(config.getCredentialKey()).toMatch(
			/^adk_\[object Object\]_none_\d+$/,
		);
	});

	it("credentialKey [] still preserved (nineteenth control)", () => {
		const empty: any = [];
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: empty,
		});
		expect(config.getCredentialKey()).toBe(empty);
	});

	it("credentialKey number 1 still preserved (nineteenth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			credentialKey: 1 as any,
		});
		expect(config.getCredentialKey()).toBe(1);
	});
});
