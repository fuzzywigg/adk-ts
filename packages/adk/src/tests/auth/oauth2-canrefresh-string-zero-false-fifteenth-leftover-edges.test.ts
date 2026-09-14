import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Fifteenth leftover: `canRefresh` uses `!!this.refreshToken` — `"0"` /
 * `"false"` are truthy (unlike `""`). Eleventh pins whitespace; fourteenth
 * pins refresh *result* `"0"` overwrite, not the canRefresh ctor gate.
 */
describe("oauth2 canRefresh string-zero-false fifteenth leftover", () => {
	it.each([
		{ label: '"0"', refreshToken: "0" },
		{ label: '"false"', refreshToken: "false" },
	])("canRefresh true for refreshToken $label", ({ refreshToken }) => {
		const refreshFunction = vi.fn(async () => ({ accessToken: "rotated" }));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken,
			refreshFunction,
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it('refresh passes refreshToken "0" through to refreshFunction', async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "0",
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith("0");
		expect(credential.getToken()).toBe("from:0");
		expect(credential.refreshToken).toBe("0");
	});

	it('refresh passes refreshToken "false" through', async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "false",
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith("false");
		expect(credential.getToken()).toBe("from:false");
	});

	it("empty-string refreshToken still cannot refresh (control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});
});
