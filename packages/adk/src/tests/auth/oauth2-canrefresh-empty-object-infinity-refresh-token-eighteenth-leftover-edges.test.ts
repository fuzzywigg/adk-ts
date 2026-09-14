import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover (HEAVY tip-relaunch residual after #242):
 * `canRefresh` uses `!!this.refreshToken` — eighteenth pins string `"true"`;
 * seventeenth pins boolean `true`. Empty object `{}` and `Infinity` are
 * likewise truthy for !! and pass through to refreshFunction.
 */
describe("oauth2 canRefresh empty-object / Infinity refreshToken eighteenth leftover", () => {
	it("canRefresh true for refreshToken {}", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: {} as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("canRefresh true for refreshToken Infinity", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: Number.POSITIVE_INFINITY as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes Infinity refreshToken through to refreshFunction", async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${String(token)}`,
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

	it('string "true" still canRefresh (eighteenth control)', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "true",
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});
});
