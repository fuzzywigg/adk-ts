import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Nineteenth leftover: `canRefresh` uses `!!this.refreshToken` — eighteenth
 * pins string `"true"`; seventeenth pins boolean `true`. Number `1` is
 * likewise truthy for !! and is passed through to refreshFunction.
 */
describe("oauth2 canRefresh number-one refreshToken nineteenth leftover", () => {
	it("canRefresh true for refreshToken number 1", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: 1 as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes number 1 refreshToken through to refreshFunction", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: 1 as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(1);
		expect(credential.getToken()).toBe("from:1");
		expect(credential.refreshToken).toBe(1);
	});

	it('string "true" still canRefresh (eighteenth control)', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "true",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("boolean true still canRefresh (seventeenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: true as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});
});
