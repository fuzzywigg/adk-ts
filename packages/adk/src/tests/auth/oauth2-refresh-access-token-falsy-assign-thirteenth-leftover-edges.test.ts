import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Thirteenth leftover: refresh() always assigns `this.accessToken =
 * result.accessToken` with no truthiness gate (unlike refreshToken/expiresIn).
 * Eleventh covers truthy `{}` → undefined; this pins explicit falsy/whitespace
 * accessToken values that still overwrite the prior token.
 */
describe("oauth2 refresh accessToken falsy-assign thirteenth leftover", () => {
	it.each([
		{ label: "empty string", accessToken: "" },
		{ label: "space", accessToken: " " },
		{ label: "0", accessToken: 0 as any },
		{ label: "false", accessToken: false as any },
		{ label: "null", accessToken: null as any },
	])("overwrites prior accessToken with $label", async ({ accessToken }) => {
		const credential = new OAuth2Credential({
			accessToken: "prior-token",
			refreshToken: "r",
			refreshFunction: async () =>
				({
					accessToken,
				}) as any,
		});
		await credential.refresh();
		expect(credential.getToken()).toBe(accessToken);
		expect(credential.getHeaders()).toEqual({
			Authorization: `Bearer ${accessToken}`,
		});
	});

	it("keeps prior refreshToken when result omits refreshToken (control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "prior",
			refreshToken: "keep-me",
			refreshFunction: async () => ({ accessToken: "" }) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
		expect(credential.getToken()).toBe("");
	});
});
