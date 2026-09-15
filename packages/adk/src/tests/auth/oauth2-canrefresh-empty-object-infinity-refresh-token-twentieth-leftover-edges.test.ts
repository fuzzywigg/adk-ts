import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twentieth leftover: `canRefresh` uses `!!this.refreshToken` — nineteenth
 * pins number `1`; eighteenth pins string `"true"`. Empty object `{}` and
 * `Infinity` are likewise truthy for !! and are passed through to
 * refreshFunction (distinct from number-one / string-true peers).
 */
describe("oauth2 canRefresh empty-object/Infinity refreshToken twentieth leftover", () => {
	it("canRefresh true for refreshToken empty object {}", () => {
		const empty: any = {};
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: empty,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes empty object {} through to refreshFunction", async () => {
		const empty: any = {};
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${typeof token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: empty,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(empty);
		expect(credential.getToken()).toBe("from:object");
		expect(credential.refreshToken).toBe(empty);
	});

	it("canRefresh true for refreshToken Infinity", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: Number.POSITIVE_INFINITY as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes Infinity through to refreshFunction", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: Number.POSITIVE_INFINITY as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(Number.POSITIVE_INFINITY);
		expect(credential.getToken()).toBe("from:Infinity");
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
