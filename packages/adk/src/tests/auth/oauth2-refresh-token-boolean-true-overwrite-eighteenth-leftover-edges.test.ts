import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover: `if (result.refreshToken)` — fourteenth pins string
 * `"0"` overwrite; seventeenth pins ctor/canRefresh boolean `true`. Result
 * boolean `true` is truthy and overwrites the prior refreshToken (kept as
 * boolean, not stringified).
 */
describe("oauth2 refreshToken boolean-true overwrite eighteenth leftover", () => {
	it("overwrites prior refreshToken with boolean true", async () => {
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
		expect(credential.canRefresh()).toBe(true);
	});

	it('string "true" still overwrites (string-true twin)', async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () => ({
				accessToken: "n",
				refreshToken: "true",
			}),
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("true");
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

	it('string "0" still overwrites (fourteenth control)', async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () => ({
				accessToken: "n",
				refreshToken: "0",
			}),
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("0");
	});
});
