import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Twelfth leftover: generateCredentialKey uses `authScheme.type || "unknown"`.
 * Eleventh leftover embeds falsy types on *plain* AuthConfig via template
 * string; Enhanced empty string falls through to "unknown", while whitespace
 * and `"0"` stay in the key.
 */
describe("enhanced auth scheme type || unknown whitespace twelfth leftover", () => {
	it('empty-string type falls through to "unknown"', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_unknown_none_\d+$/);
	});

	it("whitespace type is truthy and kept inside the generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: " " } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_ _none_\d+$/);
	});

	it.each([
		{ label: "0", type: 0 as any, fragment: "unknown" },
		{ label: "false", type: false as any, fragment: "unknown" },
		{ label: "undefined", type: undefined as any, fragment: "unknown" },
		{ label: "string 0", type: "0" as any, fragment: "0" },
	])("$label type || unknown → adk_$fragment_", ({ type, fragment }) => {
		const config = new EnhancedAuthConfig({
			authScheme: { type } as any,
		});
		expect(config.getCredentialKey()).toMatch(
			new RegExp(`^adk_${fragment}_none_\\d+$`),
		);
	});

	it("truthy string type still embeds literally (control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2_none_\d+$/);
	});
});
