import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Fourteenth leftover: `if (result.refreshToken)` — tenth pins falsy
 * ""/0/false/null keep prior; eleventh pins whitespace overwrite. String
 * `"0"` is truthy and overwrites `"keep-me"`.
 */
describe("oauth2 refreshToken string-zero overwrite fourteenth leftover", () => {
	it('overwrites prior refreshToken with truthy "0"', async () => {
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
		expect(credential.canRefresh()).toBe(true);
	});

	it("numeric 0 still keeps prior (tenth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () =>
				({
					accessToken: "n",
					refreshToken: 0,
				}) as any,
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
	});

	it("empty string still keeps prior (tenth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "keep-me",
			refreshFunction: async () => ({
				accessToken: "n",
				refreshToken: "",
			}),
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
	});
});
