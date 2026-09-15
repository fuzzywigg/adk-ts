import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover residual deepen (complements #287 {}/Infinity
 * canRefresh): `!!this.refreshToken` — `Object(true)` / string `"Infinity"`
 * are truthy and pass through; `NaN` is falsy → canRefresh false (asymmetry
 * vs Infinity/object peers).
 */
describe("oauth2 canRefresh object-true/NaN refreshToken twentieth residual deepen", () => {
	it("canRefresh true for refreshToken Object(true)", () => {
		const boxed = Object(true) as any;
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: boxed,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes Object(true) through to refreshFunction", async () => {
		const boxed = Object(true) as any;
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${String(token)}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: boxed,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(boxed);
		expect(credential.getToken()).toBe("from:true");
		expect(credential.refreshToken).toBe(boxed);
	});

	it('canRefresh true for refreshToken string "Infinity"', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "Infinity" as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("NaN refreshToken is falsy → canRefresh false (asymmetry vs Infinity)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: Number.NaN as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(false);
		await expect(credential.refresh()).rejects.toThrow(/Cannot refresh token/);
	});

	it("empty object {} still canRefresh (twentieth control)", () => {
		const empty: any = {};
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: empty,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});
});
