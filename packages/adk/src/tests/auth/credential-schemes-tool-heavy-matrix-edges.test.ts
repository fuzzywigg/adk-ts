import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	AuthCredentialType,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
import {
	ApiKeyScheme,
	AuthSchemeType,
	HttpScheme,
	OAuth2Scheme,
	OpenIdConnectScheme,
} from "../../auth/auth-schemes";
import {
	AuthTool,
	createAuthToolArguments,
	EnhancedAuthConfig,
	isEnhancedAuthConfig,
} from "../../auth/auth-tool";

describe("Auth credential heavy matrix leftover edges", () => {
	it("BasicAuthCredential encodes colon-delimited credentials", () => {
		const credential = new BasicAuthCredential("user:name", "p@ss");
		const token = Buffer.from("user:name:p@ss").toString("base64");
		expect(credential.getToken()).toBe(token);
		expect(credential.getHeaders()).toEqual({
			Authorization: `Basic ${token}`,
		});
		expect(credential.canRefresh()).toBe(false);
		expect(credential.type).toBe(AuthCredentialType.BASIC);
	});

	it("BearerTokenCredential wraps token without mutation", () => {
		const credential = new BearerTokenCredential("tok");
		expect(credential.getToken()).toBe("tok");
		expect(credential.getHeaders().Authorization).toBe("Bearer tok");
		expect(credential.canRefresh()).toBe(false);
		expect(credential.type).toBe(AuthCredentialType.BEARER);
	});

	it("ApiKeyCredential places key only for header scheme", () => {
		const credential = new ApiKeyCredential("secret");
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "header", name: "X-Key" }),
				}),
			),
		).toEqual({ "X-Key": "secret" });
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "query", name: "key" }),
				}),
			),
		).toEqual({});
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "cookie", name: "sid" }),
				}),
			),
		).toEqual({});
		expect(credential.type).toBe(AuthCredentialType.API_KEY);
	});

	it("OAuth2Credential tracks expiry and refresh rotation", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "refresh",
			expiresIn: 10,
			refreshFunction: async () => ({
				accessToken: "next",
				refreshToken: "next-r",
				expiresIn: 3600,
			}),
		});
		expect(credential.canRefresh()).toBe(true);
		expect(credential.isExpired()).toBe(true);
		await credential.refresh();
		expect(credential.getToken()).toBe("next");
		expect(credential.refreshToken).toBe("next-r");
		expect(credential.isExpired()).toBe(false);
		expect(credential.getHeaders()).toEqual({
			Authorization: "Bearer next",
		});
	});

	it("OAuth2Credential rejects refresh without refreshFunction", async () => {
		const credential = new OAuth2Credential({ accessToken: "access" });
		expect(credential.canRefresh()).toBe(false);
		await expect(credential.refresh()).rejects.toThrow(/Cannot refresh token/);
	});

	it("OAuth2Credential without expiresIn is not expired", () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "r",
		});
		expect(credential.isExpired()).toBe(false);
	});
});

describe("Auth schemes heavy matrix leftover edges", () => {
	it("enumerates scheme type string values", () => {
		expect(AuthSchemeType.APIKEY).toBe("apiKey");
		expect(AuthSchemeType.HTTP).toBe("http");
		expect(AuthSchemeType.OAUTH2).toBe("oauth2");
		expect(AuthSchemeType.OPENID_CONNECT).toBe("openIdConnect");
	});

	it("ApiKeyScheme supports header/query/cookie placements", () => {
		for (const placement of ["header", "query", "cookie"] as const) {
			const scheme = new ApiKeyScheme({ in: placement, name: "k" });
			expect(scheme.type).toBe(AuthSchemeType.APIKEY);
			expect(scheme.in).toBe(placement);
		}
	});

	it("HttpScheme supports basic/bearer/digest/other", () => {
		for (const schemeName of ["basic", "bearer", "digest", "other"] as const) {
			const scheme = new HttpScheme({ scheme: schemeName });
			expect(scheme.type).toBe(AuthSchemeType.HTTP);
			expect(scheme.scheme).toBe(schemeName);
		}
	});

	it("OAuth2Scheme stores all flow variants", () => {
		const scheme = new OAuth2Scheme({
			flows: {
				implicit: {
					authorizationUrl: "https://a/i",
					scopes: { openid: "id" },
				},
				password: { tokenUrl: "https://a/t", scopes: { w: "write" } },
				clientCredentials: {
					tokenUrl: "https://a/t",
					refreshUrl: "https://a/r",
					scopes: { a: "admin" },
				},
				authorizationCode: {
					authorizationUrl: "https://a/auth",
					tokenUrl: "https://a/token",
					scopes: { r: "read" },
				},
			},
			description: "all-flows",
		});
		expect(scheme.type).toBe(AuthSchemeType.OAUTH2);
		expect(scheme.description).toBe("all-flows");
		expect(scheme.flows.implicit?.scopes.openid).toBe("id");
		expect(scheme.flows.password?.scopes.w).toBe("write");
		expect(scheme.flows.clientCredentials?.refreshUrl).toContain("/r");
		expect(scheme.flows.authorizationCode?.authorizationUrl).toContain("/auth");
	});

	it("OpenIdConnectScheme stores URL and optional description", () => {
		const scheme = new OpenIdConnectScheme({
			openIdConnectUrl: "https://issuer/.well-known/openid",
			description: "oidc",
		});
		expect(scheme.type).toBe(AuthSchemeType.OPENID_CONNECT);
		expect(scheme.openIdConnectUrl).toContain("openid");
		expect(scheme.description).toBe("oidc");
	});
});

describe("AuthTool heavy matrix leftover edges", () => {
	it("validateAuthArguments accepts well-formed payloads", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: { authScheme: { type: "apiKey" } },
			}),
		).toBe(true);
	});

	it("validateAuthArguments rejects missing fields", () => {
		expect(() => AuthTool.validateAuthArguments(null)).toThrow();
		expect(AuthTool.validateAuthArguments({})).toBe(false);
		expect(
			AuthTool.validateAuthArguments({ function_call_id: 1, auth_config: {} }),
		).toBe(false);
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "x",
				auth_config: null,
			}),
		).toBeFalsy();
	});

	it("processAuthRequest returns credential key for EnhancedAuthConfig", async () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "X-API-Key" }),
			credentialKey: "fixed-key",
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc",
			auth_config: enhanced,
		});
		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toBe("fixed-key");
		expect(result.authConfig).toBe(enhanced);
	});

	it("processAuthRequest generates key for plain AuthConfig", async () => {
		const config = new AuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc",
			auth_config: config,
		});
		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toMatch(/^adk_http_/);
	});

	it("createAuthToolArguments and isEnhancedAuthConfig helpers", () => {
		const scheme = new ApiKeyScheme({ in: "header", name: "k" });
		const enhanced = new EnhancedAuthConfig({ authScheme: scheme });
		const basic = new AuthConfig({ authScheme: scheme });
		const args = createAuthToolArguments("fc-9", enhanced);
		expect(args.function_call_id).toBe("fc-9");
		expect(args.auth_config).toBe(enhanced);
		expect(isEnhancedAuthConfig(enhanced)).toBe(true);
		expect(isEnhancedAuthConfig(basic)).toBe(false);
	});

	it("EnhancedAuthConfig generates credential keys when omitted", () => {
		vi.spyOn(Date, "now").mockReturnValue(12345);
		const enhanced = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "query", name: "k" }),
			rawAuthCredential: new ApiKeyCredential("s"),
		});
		expect(enhanced.getCredentialKey()).toMatch(/^adk_apiKey_api_key_12345$/);
		vi.restoreAllMocks();
	});

	it("EnhancedAuthConfig getCredentialKey regenerates when cleared", () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
			credentialKey: "keep",
		});
		expect(enhanced.getCredentialKey()).toBe("keep");
		enhanced.credentialKey = undefined;
		expect(enhanced.getCredentialKey()).toMatch(/^adk_http_none_/);
	});
});
