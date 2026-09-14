import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Seventeenth leftover: `canRefresh` uses `!!this.refreshToken` — fifteenth
 * pins string `"0"` / `"false"`. Boolean `true` is also truthy for !! and is
 * passed through to refreshFunction (coerced when concatenated later).
 */
describe("oauth2 canRefresh boolean-true refreshToken seventeenth leftover", () => {
	it("canRefresh true for refreshToken boolean true", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: true as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes boolean true refreshToken through to refreshFunction", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: true as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(true);
		expect(credential.getToken()).toBe("from:true");
		expect(credential.refreshToken).toBe(true);
	});

	it('string "false" still canRefresh (fifteenth control)', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "false",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("boolean false still cannot refresh (control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: false as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});
});
