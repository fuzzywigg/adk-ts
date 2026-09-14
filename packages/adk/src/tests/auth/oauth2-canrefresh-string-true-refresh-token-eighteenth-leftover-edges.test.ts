import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover: `canRefresh` uses `!!this.refreshToken` — seventeenth
 * pins boolean `true`. String `"true"` is likewise truthy for !! and is
 * passed through to refreshFunction (distinct token from boolean true /
 * fifteenth `"false"`).
 */
describe("oauth2 canRefresh string-true refreshToken eighteenth leftover", () => {
	it('canRefresh true for refreshToken "true"', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "true",
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it('refresh passes string "true" refreshToken through to refreshFunction', async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "true",
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith("true");
		expect(credential.getToken()).toBe("from:true");
		expect(credential.refreshToken).toBe("true");
	});

	it("boolean true still canRefresh (seventeenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: true as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it('string "false" still canRefresh (fifteenth control)', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "false",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});
});
