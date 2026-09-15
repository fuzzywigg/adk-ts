import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #258):
 * `canRefresh` uses `!!this.refreshToken` — fifteenth pins string `"0"` /
 * `"false"` truthy. SameValueZero residual: `-0` is falsy for !! even though
 * `Object.is(-0, 0)` is false → canRefresh false (skip arm).
 */
describe("oauth2 canRefresh negzero falsy-skip twentieth leftover", () => {
	it("canRefresh false for refreshToken -0", () => {
		expect(!!-0).toBe(false);
		expect(Object.is(-0, 0)).toBe(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: -0 as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});

	it("refresh throws when refreshToken is -0", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: -0 as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		await expect(credential.refresh()).rejects.toThrow(/Cannot refresh token/);
	});

	it("numeric 0 still cannot refresh (falsy control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: 0 as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});
});
