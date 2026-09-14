import { describe, expect, it } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eleventh leftover: refresh() only rejects when !result; a truthy empty
 * object `{}` passes and assigns accessToken = undefined without throwing.
 * Distinct from tenth falsy refreshToken/expiresIn result fields.
 */
describe("oauth2 refresh truthy-empty-object eleventh leftover edges", () => {
	it("accepts truthy {} result and clears accessToken to undefined", async () => {
		const credential = new OAuth2Credential({
			accessToken: "prior",
			refreshToken: "r",
			refreshFunction: async () => ({}) as any,
		});
		await expect(credential.refresh()).resolves.toBeUndefined();
		expect(credential.getToken()).toBeUndefined();
		expect(credential.refreshToken).toBe("r");
		expect(credential.getHeaders()).toEqual({
			Authorization: "Bearer undefined",
		});
	});

	it("truthy result with only accessToken still updates token", async () => {
		const credential = new OAuth2Credential({
			accessToken: "prior",
			refreshToken: "r",
			refreshFunction: async () => ({ accessToken: "only-access" }) as any,
		});
		await credential.refresh();
		expect(credential.getToken()).toBe("only-access");
		expect(credential.refreshToken).toBe("r");
	});

	it.each([
		{ label: "undefined", result: undefined },
		{ label: "null", result: null },
		{ label: "0", result: 0 },
		{ label: "empty string", result: "" },
		{ label: "false", result: false },
	])("still rejects falsy refresh result ($label)", async ({ result }) => {
		const credential = new OAuth2Credential({
			accessToken: "prior",
			refreshToken: "r",
			refreshFunction: async () => result as any,
		});
		await expect(credential.refresh()).rejects.toThrow(
			/Failed to refresh token/,
		);
		expect(credential.getToken()).toBe("prior");
	});
});
