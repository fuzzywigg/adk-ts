import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Thirteenth leftover: generateCredentialKey uses
 * `rawAuthCredential?.type || "none"`. Twelfth burned scheme-side
 * `type || "unknown"`; credential-side only covered omitted credential.
 */
describe("enhanced auth credential type || none thirteenth leftover", () => {
	it.each([
		{ label: "empty string", type: "" as any, fragment: "none" },
		{ label: "0", type: 0 as any, fragment: "none" },
		{ label: "false", type: false as any, fragment: "none" },
		{ label: "null", type: null as any, fragment: "none" },
		{ label: "whitespace", type: " " as any, fragment: " " },
		{ label: "string 0", type: "0" as any, fragment: "0" },
	])("$label credential type → adk_apiKey_$fragment_", ({ type, fragment }) => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			rawAuthCredential: { type } as any,
		});
		expect(config.getCredentialKey()).toMatch(
			new RegExp(`^adk_apiKey_${fragment}_\\d+$`),
		);
	});

	it("omitted rawAuthCredential still yields none (control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});
});
