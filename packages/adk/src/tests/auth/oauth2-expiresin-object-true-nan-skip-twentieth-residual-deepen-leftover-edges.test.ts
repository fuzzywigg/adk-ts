import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover residual deepen (complements #287 -0 skip /
 * string-"Infinity"): `if (config.expiresIn)` — `Object(true)` is truthy
 * and `Object(true) * 1000` → `1000` → valid now+1s Date (asymmetry vs
 * string `"Infinity"` Invalid Date). `NaN` is falsy → skips expiresAt
 * (same skip family as `-0`).
 */
describe("oauth2 expiresIn object-true enter / NaN skip twentieth residual deepen", () => {
	it("ctor expiresIn Object(true) → now + 1s valid Date", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect((Object(true) as any) * 1000).toBe(1000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Object(true) as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("refresh expiresIn Object(true) → now + 1s", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: Object(true),
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("ctor expiresIn NaN is falsy → skips expiresAt", () => {
		expect(Boolean(Number.NaN)).toBe(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Number.NaN as any,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});

	it('string "Infinity" still → Invalid Date (twentieth control)', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "Infinity" as any,
		});
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});
});
