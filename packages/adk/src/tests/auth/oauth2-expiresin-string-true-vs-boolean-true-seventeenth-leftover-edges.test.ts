import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Seventeenth leftover: `if (config.expiresIn)` / `if (result.expiresIn)` —
 * sixteenth pins boolean `true` → `true * 1000` = 1000ms. String `"true"` is
 * also truthy but `"true" * 1000` → NaN → Invalid Date (same isExpired-false
 * outcome as fifteenth `"false"` / sixteenth Infinity, different coercion).
 */
describe("oauth2 expiresIn string-true vs boolean-true seventeenth leftover", () => {
	it('ctor expiresIn "true" → Invalid Date → isExpired false', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "true" as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("ctor expiresIn true still → now + 1000ms (sixteenth control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: true as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it('refresh expiresIn "true" → Invalid Date', async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: "true",
				}) as any,
		});
		await credential.refresh();
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("numeric 0 still skips (eleventh control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 0,
		});
		expect(credential.expiresAt).toBeUndefined();
	});
});
