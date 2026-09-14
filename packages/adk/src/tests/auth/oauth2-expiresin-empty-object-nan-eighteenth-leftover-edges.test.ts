import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover: truthy non-numeric `expiresIn` beyond seventeenth
 * `[]` / `[1]` / `"true"`. Empty object `{}` is truthy and `{} * 1000` → NaN
 * → Invalid Date → isExpired false (same outcome as Infinity / `"true"`,
 * different coercion).
 */
describe("oauth2 expiresIn empty-object nan eighteenth leftover", () => {
	it("ctor expiresIn {} → Invalid Date → isExpired false", () => {
		expect(({} as any) * 1000).toBeNaN();
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: {} as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("refresh expiresIn {} → Invalid Date", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: {},
				}) as any,
		});
		await credential.refresh();
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("ctor expiresIn [1] still → now + 1000ms (nonempty-array control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [1] as any,
		});
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
