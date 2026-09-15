import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twenty-first leftover residual deepen (complements #287 Infinity/`{}`):
 * string `"Infinity"` / `Object(1)` / `Object(false)` are all truthy for
 * `!!this.refreshToken` and pass through to refreshFunction — notably
 * boxed false (truthy) vs bare `false` (falsy canRefresh).
 */
describe("oauth2 canRefresh string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it('canRefresh true for refreshToken string "Infinity"', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "Infinity" as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it('refresh passes string "Infinity" through to refreshFunction', async () => {
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "Infinity" as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith("Infinity");
		expect(credential.getToken()).toBe("from:Infinity");
	});

	it("canRefresh true for refreshToken Object(1)", () => {
		const boxed = Object(1);
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: boxed as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes Object(1) through to refreshFunction", async () => {
		const boxed = Object(1);
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${typeof token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: boxed as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(boxed);
		expect(credential.getToken()).toBe("from:object");
	});

	it("canRefresh true for refreshToken Object(false) (boxed truthy)", () => {
		const boxed = Object(false);
		expect(Boolean(boxed)).toBe(true);
		expect(Boolean(false)).toBe(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: boxed as any,
			refreshFunction: async () => ({ accessToken: "rotated" }),
		});
		expect(credential.canRefresh()).toBe(true);
	});

	it("refresh passes Object(false) through to refreshFunction", async () => {
		const boxed = Object(false);
		const refreshFunction = vi.fn(async (token: string) => ({
			accessToken: `from:${typeof token}`,
		}));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: boxed as any,
			refreshFunction,
		});
		await credential.refresh();
		expect(refreshFunction).toHaveBeenCalledWith(boxed);
		expect(credential.getToken()).toBe("from:object");
	});

	it("bare false still cannot refresh (falsy control)", () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: false as any,
			refreshFunction: async () => ({ accessToken: "n" }),
		});
		expect(credential.canRefresh()).toBe(false);
	});
});
