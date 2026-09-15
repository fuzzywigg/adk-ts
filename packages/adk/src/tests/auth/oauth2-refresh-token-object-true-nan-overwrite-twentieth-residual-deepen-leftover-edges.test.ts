import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover residual deepen (complements #287 {}/Infinity
 * overwrite): `if (result.refreshToken)` — `Object(true)` overwrites;
 * `NaN` is falsy → keeps prior (asymmetry vs Infinity overwrite).
 */
describe("oauth2 refreshToken object-true/NaN overwrite twentieth residual deepen", () => {
	it("overwrites prior refreshToken with Object(true)", async () => {
		const boxed = Object(true) as any;
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: boxed,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe(boxed);
		expect(credential.canRefresh()).toBe(true);
	});

	it('overwrites prior refreshToken with string "Infinity"', async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: "Infinity",
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("Infinity");
		expect(credential.canRefresh()).toBe(true);
	});

	it("NaN refreshToken keeps prior (falsy asymmetry vs Infinity)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: Number.NaN,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
	});

	it("Infinity still overwrites (twentieth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: Number.POSITIVE_INFINITY,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe(Number.POSITIVE_INFINITY);
	});
});
