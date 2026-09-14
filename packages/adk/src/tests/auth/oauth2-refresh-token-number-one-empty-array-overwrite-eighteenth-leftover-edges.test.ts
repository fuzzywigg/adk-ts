import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #242):
 * `if (result.refreshToken)` — eighteenth pins boolean `true` overwrite;
 * fourteenth pins string `"0"`. Number `1` and nonempty/`[]` empty array are
 * likewise truthy and overwrite the prior refreshToken (kept as-is).
 */
describe("oauth2 refreshToken number-one / empty-array overwrite eighteenth leftover", () => {
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
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: [],
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toEqual([]);
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
