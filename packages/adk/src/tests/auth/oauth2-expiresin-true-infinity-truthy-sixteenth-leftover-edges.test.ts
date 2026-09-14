import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Sixteenth leftover: `if (config.expiresIn)` / `if (result.expiresIn)` —
 * fifteenth pins string `"0"`/`"false"` enter; eleventh pins falsy skip.
 * Boolean `true` and `Infinity` are non-numeric truthy enterers:
 * `true * 1000` → 1000; `Infinity * 1000` → Infinity Date.
 */
describe("oauth2 expiresIn true/Infinity truthy sixteenth leftover", () => {
	it("ctor expiresIn true → expiresAt = now + 1000ms", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: true as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("ctor expiresIn Infinity → Infinity Date → isExpired false", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Number.POSITIVE_INFINITY as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(credential.expiresAt!.getTime()).toBe(Number.POSITIVE_INFINITY);
		expect(credential.isExpired()).toBe(false);
	});

	it("refresh expiresIn true updates expiresAt = now + 1000ms", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: true,
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("numeric 0 still skips (eleventh control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 0,
		});
		expect(credential.expiresAt).toBeUndefined();
	});
});
