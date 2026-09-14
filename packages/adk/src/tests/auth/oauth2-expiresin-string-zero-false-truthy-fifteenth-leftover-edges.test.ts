import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Fifteenth leftover: `if (config.expiresIn)` / `if (result.expiresIn)` —
 * eleventh pins falsy 0/false/"" and whitespace `" "` → expiresAt≈now.
 * String `"0"` / `"false"` are truthy and enter the branch (asymmetry vs
 * numeric 0 skip); `"0"*1000`→0; `"false"*1000`→NaN Invalid Date.
 */
describe("oauth2 expiresIn string-zero-false truthy fifteenth leftover", () => {
	it('ctor expiresIn "0" sets expiresAt ≈ now → isExpired true', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "0" as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it('ctor expiresIn "false" → Invalid Date → isExpired false', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "false" as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it('refresh expiresIn "0" updates expiresAt ≈ now', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: "0",
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("numeric 0 still skips (eleventh control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 0,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});
});
