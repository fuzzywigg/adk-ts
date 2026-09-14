import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #242 / tip #254):
 * `if (config.expiresIn)` — eleventh pins falsy 0/NaN/false skip; sixteenth
 * pins Infinity enter. SameValueZero residual: `-0` is falsy (`!!(-0)` false)
 * even though `Object.is(-0, 0)` is false → expiresAt unset (skip arm), not
 * `(-0)*1000` enter.
 */
describe("oauth2 expiresIn negzero falsy-skip eighteenth leftover", () => {
	it("ctor expiresIn -0 skips → expiresAt undefined", () => {
		expect(!!-0).toBe(false);
		expect(Object.is(-0, 0)).toBe(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: -0 as any,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});

	it("refresh expiresIn -0 keeps prior expiresAt", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: -0,
				}) as any,
		});
		const prior = credential.expiresAt!.getTime();
		await credential.refresh();
		expect(credential.expiresAt!.getTime()).toBe(prior);
		vi.useRealTimers();
	});

	it("numeric 0 still skips (eleventh control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 0,
		});
		expect(credential.expiresAt).toBeUndefined();
	});

	it("POSITIVE_INFINITY still enters Invalid Date (sixteenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Number.POSITIVE_INFINITY as any,
		});
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
	});
});
