import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Nineteenth leftover: `if (config.expiresIn)` then `expiresIn * 1000` —
 * eighteenth pins `{}` → NaN and `[1]` → 1000; seventeenth pins `"true"` →
 * NaN. Numeric string `"60"` is truthy and `"60" * 1000` → 60000 → clears
 * the 30s isExpired buffer (distinct from NaN string-true / empty-object).
 */
describe("oauth2 expiresIn numeric-string-sixty nineteenth leftover", () => {
	it('ctor expiresIn "60" → now + 60s → isExpired false', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect(("60" as any) * 1000).toBe(60000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "60" as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:01:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it('ctor expiresIn "1" → now + 1000ms → isExpired true (30s buffer)', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "1" as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it('refresh expiresIn "60" → now + 60s', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: "60",
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:01:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it("boxed Number(0) still enters (object truthy) → now + 0", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxedZero = new Number(0) as any;
		expect(Boolean(boxedZero)).toBe(true);
		expect(boxedZero * 1000).toBe(0);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: boxedZero,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("expiresIn {} still → Invalid Date (eighteenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: {} as any,
		});
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});
});
