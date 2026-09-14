import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twelfth leftover: refresh() result-side `if (result.refreshToken)` /
 * `if (result.expiresIn)` treat whitespace as truthy. Distinct from tenth
 * falsy result fields and eleventh ctor whitespace canRefresh.
 */
describe("oauth2 refresh-result whitespace token/expires twelfth leftover", () => {
	it("replaces prior refreshToken when result.refreshToken is a space", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "keep-me",
			refreshFunction: async () => ({
				accessToken: "rotated",
				refreshToken: " ",
			}),
		});
		await credential.refresh();
		expect(credential.getToken()).toBe("rotated");
		expect(credential.refreshToken).toBe(" ");
	});

	it("sets expiresAt via Number(' ')===0 when result.expiresIn is a space", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () => ({
				accessToken: "n",
				expiresIn: " " as any,
			}),
		});
		const before = credential.expiresAt?.getTime();
		await credential.refresh();
		expect(before).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() + 3600 * 1000,
		);
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("empty-string result.refreshToken still keeps prior token (tenth control)", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
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
