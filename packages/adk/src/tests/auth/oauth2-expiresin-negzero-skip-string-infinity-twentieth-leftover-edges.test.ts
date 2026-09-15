import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover: `if (config.expiresIn)` then `expiresIn * 1000` —
 * nineteenth pins numeric string `"60"` and boxed `Number(0)` enter;
 * sixteenth pins number `Infinity`. Signed zero `-0` is falsy → skip
 * arm (asymmetry vs boxed zero enter; `Object.is(-0, 0)` is false).
 * String `"Infinity"` is truthy and `"Infinity" * 1000` → `Infinity` →
 * Invalid Date (distinct from `"60"`).
 */
describe("oauth2 expiresIn negzero-skip / string-Infinity twentieth leftover", () => {
	it("ctor expiresIn -0 is falsy → skips expiresAt", () => {
		const negZero = -0;
		expect(Boolean(negZero)).toBe(false);
		expect(Object.is(negZero, -0)).toBe(true);
		expect(Object.is(negZero, 0)).toBe(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: negZero as any,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});

	it('ctor expiresIn "Infinity" → Invalid Date → isExpired false', () => {
		expect(("Infinity" as any) * 1000).toBe(Number.POSITIVE_INFINITY);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "Infinity" as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it('refresh expiresIn "Infinity" → Invalid Date', async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: "Infinity",
				}) as any,
		});
		await credential.refresh();
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("boxed Number(0) still enters (nineteenth control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxedZero = new Number(0) as any;
		expect(Boolean(boxedZero)).toBe(true);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: boxedZero,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it('numeric string "60" still → now + 60s (nineteenth control)', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "60" as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:01:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});
});
