import { describe, expect, it } from "vitest";
import { EnhancedAuthConfig } from "../../auth/auth-tool";

/**
 * Thirteenth leftover: generateCredentialKey uses
 * `rawAuthCredential?.type || "none"`. Twelfth pinned scheme-type `|| "unknown"`
 * and omitted-raw → none. Present raw with falsy type also collapses to none;
 * whitespace type stays.
 */
describe("enhanced auth rawAuthCredential.type || none thirteenth leftover", () => {
	it.each([
		{ label: "empty string", type: "" as any },
		{ label: "0", type: 0 as any },
		{ label: "false", type: false as any },
		{ label: "NaN", type: Number.NaN as any },
		{ label: "null", type: null as any },
		{ label: "undefined", type: undefined as any },
	])("present raw with type=$label → _none_ segment", ({ type }) => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
			rawAuthCredential: { type } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});

	it("whitespace raw type is truthy and kept in the key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "http" } as any,
			rawAuthCredential: { type: " " } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_http_ _\d+$/);
	});

	it('string "0" raw type is kept (control vs numeric 0)', () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "oauth2" } as any,
			rawAuthCredential: { type: "0" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_oauth2_0_\d+$/);
	});

	it("omitted rawAuthCredential still yields none (twelfth control)", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "apiKey" } as any,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});
});
