import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Nineteenth leftover: `if (result.refreshToken)` — eighteenth pins boolean
 * `true` overwrite; fourteenth pins string `"0"`. Result number `1` is
 * truthy and overwrites the prior refreshToken (kept as number, not
 * stringified).
 */
describe("oauth2 refreshToken number-one overwrite nineteenth leftover", () => {
	it("overwrites prior refreshToken with number 1", async () => {
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
		expect(credential.canRefresh()).toBe(true);
	});

	it("overwrites prior refreshToken with empty array []", async () => {
		const empty: any = [];
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

	it("boolean true still overwrites (eighteenth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: true,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe(true);
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
