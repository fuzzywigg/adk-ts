import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover (HEAVY tip-relaunch residual after #258):
 * `if (result.refreshToken)` — nineteenth pins number `1` / `[]` overwrite;
 * eighteenth pins boolean `true`. Empty object `{}` and `Infinity` are
 * likewise truthy and overwrite the prior refreshToken.
 */
describe("oauth2 refreshToken empty-object / Infinity overwrite twentieth leftover", () => {
	it("overwrites prior refreshToken with {}", async () => {
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

	it("overwrites with -0 still skips (falsy residual twin)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: -0,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
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
});
