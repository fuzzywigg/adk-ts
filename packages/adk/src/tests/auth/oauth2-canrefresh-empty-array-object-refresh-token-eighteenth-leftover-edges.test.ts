import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover: `canRefresh` uses `!!this.refreshToken` — seventeenth
 * pins boolean `true`. Empty array `[]` / empty object `{}` / singleton
 * `[0]` are likewise truthy and pass through to refreshFunction.
 */
describe("oauth2 canRefresh empty-array/object refreshToken eighteenth leftover", () => {
	it.each([
		{ label: "[]", refreshToken: [] as any },
		{ label: "{}", refreshToken: {} as any },
		{ label: "[0]", refreshToken: [0] as any },
	])("canRefresh true for refreshToken $label", ({ refreshToken }) => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes empty array refreshToken through to refreshFunction", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${String(token)}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: [] as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith([]);
		expect(credential.getToken()).toBe("from:");
		expect(credential.refreshToken).toEqual([]);
	});

	it("boolean true still canRefresh (seventeenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: true as any,
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
