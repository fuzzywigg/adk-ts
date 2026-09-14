import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eleventh leftover: canRefresh uses !!refreshToken — whitespace-only tokens
 * are truthy (unlike "") so refresh proceeds. Empty string already covered.
 */
describe("oauth2 canRefresh whitespace-token eleventh leftover edges", () => {
	it.each([
		{ label: "space", refreshToken: " " },
		{ label: "tab", refreshToken: "\t" },
		{ label: "newline", refreshToken: "\n" },
		{ label: "spaces", refreshToken: "   " },
	])("canRefresh is true for whitespace-only refreshToken ($label)", ({
		refreshToken,
	}) => {
		const refreshFunction = vi.fn(async () => ({
			accessToken: "rotated",
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken,
			refreshFunction,
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes whitespace refreshToken through to refreshFunction", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${JSON.stringify(token)}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: " ",
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(" ");
		expect(credential.getToken()).toBe('from:" "');
		expect(credential.refreshToken).toBe(" ");
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
