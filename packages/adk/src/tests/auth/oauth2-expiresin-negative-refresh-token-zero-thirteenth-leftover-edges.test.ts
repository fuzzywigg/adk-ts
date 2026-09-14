import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Thirteenth leftover: `if (expiresIn)` is truthy for negatives/Infinity;
 * `canRefresh` treats refreshToken `"0"` as truthy. Eleventh/twelfth cover
 * falsy and whitespace expiresIn / empty refreshToken.
 */
describe("oauth2 negative expiresIn / refreshToken 0 thirteenth leftover", () => {
	it("negative expiresIn sets expiresAt in the past and isExpired", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: -5,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() - 5000,
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("Infinity expiresIn yields non-finite expiresAt via truthy branch", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: Number.POSITIVE_INFINITY,
		});
		expect(Number.isFinite(credential.expiresAt?.getTime() ?? 0)).toBe(false);
	});

	it('refreshToken "0" is truthy → canRefresh true when refreshFunction set', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "0",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("empty refreshToken still cannot refresh (eleventh control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});
});
