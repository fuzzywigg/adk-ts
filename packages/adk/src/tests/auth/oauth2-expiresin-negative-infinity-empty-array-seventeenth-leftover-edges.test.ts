import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Seventeenth leftover: non-numeric truthy `expiresIn` beyond sixteenth
 * `true` / `POSITIVE_INFINITY`. `NEGATIVE_INFINITY * 1000` → Invalid Date;
 * empty array `[]` is truthy and `[] * 1000` → 0 → expiresAt ≈ now.
 */
describe("oauth2 expiresIn negative-infinity / empty-array seventeenth leftover", () => {
	it("ctor expiresIn NEGATIVE_INFINITY → Invalid Date → isExpired false", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Number.NEGATIVE_INFINITY as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("ctor expiresIn [] → expiresAt ≈ now → isExpired true", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect(([] as any) * 1000).toBe(0);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [] as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("refresh expiresIn NEGATIVE_INFINITY → Invalid Date", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: Number.NEGATIVE_INFINITY,
				}) as any,
		});
		await credential.refresh();
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("POSITIVE_INFINITY still Invalid Date (sixteenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Number.POSITIVE_INFINITY as any,
		});
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
	});
});
