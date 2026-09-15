import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover: `canRefresh` uses `!!this.refreshToken` — nineteenth
 * pins number `1`; eighteenth pins string `"true"`. Empty object `{}`,
 * empty array `[]`, and Infinity are likewise `!!`-true and pass through
 * to refreshFunction. NegZero `-0` is `!!`-false → cannot refresh.
 */
describe("oauth2 canRefresh empty-object/array/infinity refreshToken twentieth leftover", () => {
	it("canRefresh true for refreshToken {}", () => {
		const empty: any = {};
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: empty,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes {} refreshToken through to refreshFunction", async () => {
		const empty: any = {};
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: "from-object",
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: empty,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(empty);
		expect(credential.getToken()).toBe("from-object");
		expect(credential.refreshToken).toBe(empty);
	});

	it("canRefresh true for refreshToken [] and passes through", async () => {
		const empty: any = [];
		const refreshFunction = vi.fn(async () => ({ accessToken: "from-array" }));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: empty,
			refreshFunction,
		});
		expect(credential.canRefresh()).toBe(true);
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(empty);
	});

	it("canRefresh true for refreshToken Infinity and passes through", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: Number.POSITIVE_INFINITY as any,
			refreshFunction,
		});
		expect(credential.canRefresh()).toBe(true);
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(Number.POSITIVE_INFINITY);
	});

	it("negZero -0 still cannot refresh (!! falsy)", () => {
		expect(!!-0).toBe(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: -0 as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});

	it("number 1 still canRefresh (nineteenth control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: 1 as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});
});
