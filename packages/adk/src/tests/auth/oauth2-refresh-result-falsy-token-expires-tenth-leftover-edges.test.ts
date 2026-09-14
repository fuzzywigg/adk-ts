import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Tenth leftover: refresh result if (result.refreshToken) / if (result.expiresIn)
 * truthiness — omit-refreshToken and ctor expiresIn:0 covered; result-side
 * empty string / zero are not.
 */
describe("oauth2 refresh-result falsy token/expires tenth leftover edges", () => {
	it("keeps prior refreshToken when result.refreshToken is empty string", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "keep-me",
			refreshFunction: async () => ({
				accessToken: "rotated",
				refreshToken: "",
			}),
		});
		await credential.refresh();
		expect(credential.getToken()).toBe("rotated");
		expect(credential.refreshToken).toBe("keep-me");
	});

	it.each([
		{ label: "null", refreshToken: null as any },
		{ label: "0", refreshToken: 0 as any },
		{ label: "false", refreshToken: false as any },
	])("keeps prior refreshToken when result.refreshToken is falsy ($label)", async ({
		refreshToken,
	}) => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "keep-me",
			refreshFunction: async () => ({
				accessToken: "n",
				refreshToken,
			}),
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
	});

	it("does not update expiresAt when result.expiresIn is 0", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () => ({
				accessToken: "n",
				expiresIn: 0,
			}),
		});
		const before = credential.expiresAt?.getTime();
		expect(before).toBeDefined();
		await credential.refresh();
		expect(credential.getToken()).toBe("n");
		expect(credential.expiresAt?.getTime()).toBe(before);
		vi.useRealTimers();
	});

	it.each([
		{ label: "empty string", expiresIn: "" as any },
		{ label: "null", expiresIn: null as any },
		{ label: "false", expiresIn: false as any },
	])("does not update expiresAt when result.expiresIn is falsy ($label)", async ({
		expiresIn,
	}) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "r",
			expiresIn: 120,
			refreshFunction: async () => ({
				accessToken: "n",
				expiresIn,
			}),
		});
		const before = credential.expiresAt?.getTime();
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(before);
		vi.useRealTimers();
	});

	it("updates expiresAt when result.expiresIn is truthy", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "r",
			expiresIn: 60,
			refreshFunction: async () => ({
				accessToken: "n",
				refreshToken: "next",
				expiresIn: 7200,
			}),
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("next");
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() + 7200 * 1000,
		);
		vi.useRealTimers();
	});
});
