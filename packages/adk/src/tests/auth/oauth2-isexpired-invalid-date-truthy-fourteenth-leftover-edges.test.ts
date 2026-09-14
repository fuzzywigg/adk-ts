import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Fourteenth leftover: `if (!this.expiresAt) return false` then
 * `expiresAt.getTime() - 30000 < Date.now()`. Invalid Date is a truthy object
 * whose getTime() is NaN; NaN < now is false → isExpired() false (no throw).
 */
describe("oauth2 isExpired Invalid Date truthy fourteenth leftover", () => {
	it("Invalid Date expiresAt → isExpired false", () => {
		const credential = new OAuth2Credential({ accessToken: "a" });
		credential.expiresAt = new Date(Number.NaN);
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("missing expiresAt still false (control)", () => {
		const credential = new OAuth2Credential({ accessToken: "a" });
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});

	it("valid near-expiry still true (control)", () => {
		const credential = new OAuth2Credential({ accessToken: "a" });
		credential.expiresAt = new Date(Date.now() + 10_000);
		expect(credential.isExpired()).toBe(true);
	});
});
