import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twenty-first leftover residual deepen (complements #287 Infinity/`{}`):
 * `if (result.refreshToken)` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` are truthy and overwrite prior refreshToken. Boxed false
 * overwrites (asymmetry vs bare `false` keep).
 */
describe("oauth2 refreshToken string-infinity/object-one/object-false overwrite twenty-first residual deepen", () => {
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

	it("overwrites prior refreshToken with Object(1)", async () => {
		const boxed = Object(1);
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

	it("overwrites prior refreshToken with Object(false) (boxed truthy)", async () => {
		const boxed = Object(false);
		expect(Boolean(boxed)).toBe(true);
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

	it("number Infinity still overwrites (twentieth control)", async () => {
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
