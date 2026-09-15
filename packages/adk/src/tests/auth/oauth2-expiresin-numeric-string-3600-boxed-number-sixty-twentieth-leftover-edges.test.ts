import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover: `if (config.expiresIn)` then `expiresIn * 1000` —
 * nineteenth pins `"60"` / boxed `Number(0)`. Numeric string `"3600"` is
 * truthy and `"3600" * 1000` → 3600000; boxed `Number(60)` enters (object
 * truthy) → 60000 — both clear the 30s isExpired buffer.
 */
describe("oauth2 expiresIn numeric-string-3600 / boxed-Number(60) twentieth leftover", () => {
	it('ctor expiresIn "3600" → now + 1h → isExpired false', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect(("3600" as any) * 1000).toBe(3600000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "3600" as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T01:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it("ctor expiresIn boxed Number(60) → now + 60s → isExpired false", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxedSixty = new Number(60) as any;
		expect(Boolean(boxedSixty)).toBe(true);
		expect(boxedSixty * 1000).toBe(60000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: boxedSixty,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:01:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it('refresh expiresIn "3600" → now + 1h', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 60,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: "3600",
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T01:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it('expiresIn "60" still → now + 60s (nineteenth control)', () => {
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

	it("boxed Number(0) still enters → now + 0 (nineteenth control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: new Number(0) as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});
});
