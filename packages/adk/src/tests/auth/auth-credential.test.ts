import { describe, expect, it } from "vitest";
import {
	ApiKeyCredential,
	AuthCredential,
	AuthCredentialType,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyScheme } from "../../auth/auth-schemes";

describe("auth credentials", () => {
	it("builds basic auth headers", () => {
		const credential = new BasicAuthCredential("user", "pass");
		const expected = Buffer.from("user:pass").toString("base64");
		expect(credential.getToken()).toBe(expected);
		expect(credential.getHeaders()).toEqual({
			Authorization: `Basic ${expected}`,
		});
		expect(credential.canRefresh()).toBe(false);
	});

	it("builds bearer auth headers", () => {
		const credential = new BearerTokenCredential("token-123");
		expect(credential.getToken()).toBe("token-123");
		expect(credential.getHeaders()).toEqual({
			Authorization: "Bearer token-123",
		});
	});

	it("places api keys in headers when configured", () => {
		const credential = new ApiKeyCredential("secret");
		const headerConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "X-API-Key" }),
		});
		const queryConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "query", name: "api_key" }),
		});

		expect(credential.getHeaders(headerConfig)).toEqual({
			"X-API-Key": "secret",
		});
		expect(credential.getHeaders(queryConfig)).toEqual({});
	});

	it("tracks oauth expiry and refresh capability", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 10,
			refreshFunction: async () => ({
				accessToken: "next-access",
				refreshToken: "next-refresh",
				expiresIn: 3600,
			}),
		});

		expect(credential.canRefresh()).toBe(true);
		expect(credential.isExpired()).toBe(true);
		expect(credential.getHeaders()).toEqual({
			Authorization: "Bearer access",
		});

		await credential.refresh();
		expect(credential.getToken()).toBe("next-access");
		expect(credential.refreshToken).toBe("next-refresh");
		expect(credential.isExpired()).toBe(false);
	});

	it("rejects refresh when no refresh function is available", async () => {
		const credential = new OAuth2Credential({ accessToken: "access" });
		await expect(credential.refresh()).rejects.toThrow(/Cannot refresh token/);
	});

	it("treats oauth tokens without expiresAt as not expired", () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			refreshFunction: async () => ({ accessToken: "next" }),
		});
		expect(credential.isExpired()).toBe(false);
	});

	it("keeps prior refresh token when refresh payload omits it", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "keep-me",
			expiresIn: 1,
			refreshFunction: async () => ({
				accessToken: "rotated",
			}),
		});
		await credential.refresh();
		expect(credential.getToken()).toBe("rotated");
		expect(credential.refreshToken).toBe("keep-me");
	});

	it("throws for unsupported base credential refresh", async () => {
		class Unsupported extends AuthCredential {
			getToken() {
				return "x";
			}
			getHeaders() {
				return {};
			}
		}
		const credential = new Unsupported(AuthCredentialType.API_KEY);
		await expect(credential.refresh()).rejects.toThrow(
			/Token refresh not supported/,
		);
	});
});
