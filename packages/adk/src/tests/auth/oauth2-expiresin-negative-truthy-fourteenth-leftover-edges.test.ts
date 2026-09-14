import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Fourteenth leftover: `if (config.expiresIn)` / `if (result.expiresIn)` —
 * eleventh/tenth pin falsy 0/""/false skips. Negative values are truthy and
 * enter the branch, producing an expiresAt in the past.
 */
describe("oauth2 expiresIn negative-truthy fourteenth leftover", () => {
	it("ctor expiresIn: -1 sets expiresAt ~1s in the past → isExpired", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: -1,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() - 1000,
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it('refresh expiresIn: "-1" updates expiresAt (string coerces in arithmetic)', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: "-1",
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() + Number("-1") * 1000,
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("expiresIn: 0 still skips (eleventh/tenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 0,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});
});
