import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	AuthCredential,
	AuthCredentialType,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
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
		const cookieConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "cookie", name: "session" }),
		});

		expect(credential.getHeaders(headerConfig)).toEqual({
			"X-API-Key": "secret",
		});
		expect(credential.getHeaders(queryConfig)).toEqual({});
		expect(credential.getHeaders(cookieConfig)).toEqual({});
		expect(credential.getToken()).toBe("secret");
		expect(credential.canRefresh()).toBe(false);
		expect(credential.type).toBe(AuthCredentialType.API_KEY);
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

	it("marks oauth tokens expired within the 30s skew window", () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 20,
			refreshFunction: async () => ({ accessToken: "next" }),
		});
		expect(credential.isExpired()).toBe(true);
	});

	it("throws when refresh function returns a falsy payload", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			refreshFunction: async () => undefined as any,
		});
		await expect(credential.refresh()).rejects.toThrow(
			/Failed to refresh token/,
		);
	});

	it("reports canRefresh false for bearer credentials", () => {
		const credential = new BearerTokenCredential("tok");
		expect(credential.canRefresh()).toBe(false);
		expect(credential.type).toBe(AuthCredentialType.BEARER);
	});

	it("exposes Basic and OAuth2 credential types", () => {
		expect(new BasicAuthCredential("u", "p").type).toBe(
			AuthCredentialType.BASIC,
		);
		expect(new OAuth2Credential({ accessToken: "a" }).type).toBe(
			AuthCredentialType.OAUTH2,
		);
	});

	it("canRefresh is false when only refreshToken or only refreshFunction is set", () => {
		const tokenOnly = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
		});
		expect(tokenOnly.canRefresh()).toBe(false);

		const fnOnly = new OAuth2Credential({
			accessToken: "a",
			refreshFunction: async () => ({ accessToken: "b" }),
		});
		expect(fnOnly.canRefresh()).toBe(false);
	});

	it("refresh without expiresIn leaves prior expiresAt unchanged", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 3600,
			refreshFunction: async () => ({
				accessToken: "next-access",
				refreshToken: "next-refresh",
			}),
		});
		const priorExpiry = credential.expiresAt!.getTime();
		await credential.refresh();
		expect(credential.getToken()).toBe("next-access");
		expect(credential.refreshToken).toBe("next-refresh");
		expect(credential.expiresAt!.getTime()).toBe(priorExpiry);
	});

	it("marks oauth tokens outside the skew window as not expired", () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 120,
			refreshFunction: async () => ({ accessToken: "next" }),
		});
		expect(credential.isExpired()).toBe(false);
	});

	it("base AuthCredential canRefresh defaults to false", () => {
		class Unsupported extends AuthCredential {
			getToken() {
				return "x";
			}
			getHeaders() {
				return {};
			}
		}
		expect(new Unsupported(AuthCredentialType.CUSTOM).canRefresh()).toBe(false);
		expect(new Unsupported(AuthCredentialType.CUSTOM).type).toBe(
			AuthCredentialType.CUSTOM,
		);
	});
});
