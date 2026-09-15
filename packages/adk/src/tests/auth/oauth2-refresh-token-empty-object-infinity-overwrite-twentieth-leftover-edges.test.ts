import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover: `if (result.refreshToken)` — nineteenth pins number
 * `1` / empty array `[]` overwrite; eighteenth pins boolean `true`. Result
 * empty object `{}` and `Infinity` are truthy and overwrite the prior
 * refreshToken (kept as object / number, not stringified).
 */
describe("oauth2 refreshToken empty-object/Infinity overwrite twentieth leftover", () => {
	it("overwrites prior refreshToken with empty object {}", async () => {
		const empty: any = {};
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: empty,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe(empty);
		expect(credential.canRefresh()).toBe(true);
	});

	it("overwrites prior refreshToken with Infinity", async () => {
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
		expect(credential.canRefresh()).toBe(true);
	});

	it("number 1 still overwrites (nineteenth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: 1,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe(1);
	});

	it("boolean false still keeps prior (tenth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: false,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
	});
});
