import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	AuthCredential,
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
import * as auth from "../../auth";

describe("auth credential leftover header and refresh edges", () => {
	it("BearerTokenCredential.refresh rejects with not supported", async () => {
		const credential = new BearerTokenCredential("tok");
		await expect(credential.refresh()).rejects.toThrow(
			/Token refresh not supported/,
		);
	});

	it("BasicAuthCredential.refresh rejects with not supported", async () => {
		const credential = new BasicAuthCredential("u", "p");
		await expect(credential.refresh()).rejects.toThrow(
			/Token refresh not supported/,
		);
	});

	it("OAuth2Credential.refresh rejects when refreshToken is empty string", async () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			refreshToken: "",
			refreshFunction: async () => ({ accessToken: "next" }),
		});
		expect(credential.canRefresh()).toBe(false);
		await expect(credential.refresh()).rejects.toThrow(/Cannot refresh token/);
	});

	it("ApiKeyCredential getHeaders returns {} for query and cookie placements", () => {
		const credential = new ApiKeyCredential("secret-key");
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "query", name: "api_key" }),
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
	});

	it("ApiKeyCredential header builder uses scheme.name exactly once", () => {
		const credential = new ApiKeyCredential("k");
		const headers = credential.getHeaders(
			new AuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "Authorization" }),
			}),
		);
		expect(Object.keys(headers)).toEqual(["Authorization"]);
		expect(headers.Authorization).toBe("k");
	});

	it("OAuth2 and Bearer header builders always emit Authorization Bearer", () => {
		expect(new BearerTokenCredential("b").getHeaders()).toEqual({
			Authorization: "Bearer b",
		});
		expect(new OAuth2Credential({ accessToken: "o" }).getHeaders()).toEqual({
			Authorization: "Bearer o",
		});
	});

	it("propagates refresh function rejection messages verbatim", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			refreshFunction: async () => {
				throw new Error("upstream 503");
			},
		});
		await expect(credential.refresh()).rejects.toThrow("upstream 503");
	});

	it("CUSTOM AuthCredential subclass still cannot refresh by default", async () => {
		class CustomCred extends AuthCredential {
			getToken() {
				return "custom";
			}
			getHeaders() {
				return { "X-Custom": "custom" };
			}
		}
		const credential = new CustomCred(AuthCredentialType.CUSTOM);
		expect(credential.type).toBe(AuthCredentialType.CUSTOM);
		expect(credential.getHeaders()).toEqual({ "X-Custom": "custom" });
		await expect(credential.refresh()).rejects.toThrow(/not supported/i);
	});
});

describe("auth-tool credentialKey leftover edges", () => {
	it("empty string credentialKey falls through to generated key", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x" }),
			rawAuthCredential: new ApiKeyCredential("k"),
			credentialKey: "",
		});
		expect(config.credentialKey).toMatch(/^adk_apiKey_api_key_\d+$/);
		expect(config.getCredentialKey()).toBe(config.credentialKey);
	});

	it("credentialKey with only spaces is truthy and preserved", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
			credentialKey: "   ",
		});
		expect(config.getCredentialKey()).toBe("   ");
	});

	it("getCredentialKey regenerates when credentialKey set to empty string later", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new OpenIdConnectScheme({
				openIdConnectUrl: "https://example.com/.well-known/openid",
			}),
			credentialKey: "temp",
		});
		config.credentialKey = "";
		expect(config.getCredentialKey()).toMatch(/^adk_openIdConnect_none_\d+$/);
	});

	it("processAuthRequest uses generated key for EnhancedAuthConfig with empty credentialKey", async () => {
		const authConfig = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
			credentialKey: "",
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-empty-key",
			auth_config: authConfig,
		});
		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toMatch(/^adk_http_none_\d+$/);
	});

	it("createAuthToolArguments + isEnhancedAuthConfig round-trip with credentialKey", () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new OAuth2Scheme({
				flows: {
					authorizationCode: {
						authorizationUrl: "https://example.com/auth",
						tokenUrl: "https://example.com/token",
						scopes: { read: "Read" },
					},
				},
			}),
			credentialKey: "explicit-oauth-key",
		});
		const args = createAuthToolArguments("fc-oauth", enhanced);
		expect(isEnhancedAuthConfig(args.auth_config)).toBe(true);
		expect((args.auth_config as EnhancedAuthConfig).getCredentialKey()).toBe(
			"explicit-oauth-key",
		);
	});
});

describe("auth-schemes and AuthConfig leftover edges", () => {
	it("AuthConfig preserves OpenIdConnectScheme reference and empty context", () => {
		const scheme = new OpenIdConnectScheme({
			openIdConnectUrl:
				"https://issuer.example/.well-known/openid-configuration",
			description: "oidc leftover",
		});
		const config = new AuthConfig({ authScheme: scheme, context: {} });
		expect(config.authScheme).toBe(scheme);
		expect(config.authScheme.type).toBe(AuthSchemeType.OPENID_CONNECT);
		expect(config.context).toEqual({});
	});

	it("ApiKeyScheme accepts all in placements with descriptions", () => {
		for (const place of ["header", "query", "cookie"] as const) {
			const scheme = new ApiKeyScheme({
				in: place,
				name: `name_${place}`,
				description: `desc_${place}`,
			});
			expect(scheme.type).toBe(AuthSchemeType.APIKEY);
			expect(scheme.in).toBe(place);
			expect(scheme.description).toBe(`desc_${place}`);
		}
	});

	it("HttpScheme other with bearerFormat still stores bearerFormat", () => {
		const scheme = new HttpScheme({
			scheme: "other",
			bearerFormat: "custom",
			description: "other-scheme",
		});
		expect(scheme.scheme).toBe("other");
		expect(scheme.bearerFormat).toBe("custom");
		expect(scheme.description).toBe("other-scheme");
	});

	it("OAuth2Scheme stores all four flow slots when provided", () => {
		const scheme = new OAuth2Scheme({
			flows: {
				implicit: {
					authorizationUrl: "https://example.com/i",
					scopes: { a: "A" },
				},
				password: {
					tokenUrl: "https://example.com/p",
					scopes: { b: "B" },
				},
				clientCredentials: {
					tokenUrl: "https://example.com/c",
					refreshUrl: "https://example.com/r",
					scopes: { c: "C" },
				},
				authorizationCode: {
					authorizationUrl: "https://example.com/ac",
					tokenUrl: "https://example.com/act",
					scopes: { d: "D" },
				},
			},
			description: "all-flows",
		});
		expect(Object.keys(scheme.flows).sort()).toEqual([
			"authorizationCode",
			"clientCredentials",
			"implicit",
			"password",
		]);
		expect(scheme.description).toBe("all-flows");
	});
});

describe("auth barrel leftover edges", () => {
	it("barrel AuthTool validate rejects empty function_call_id type mismatch", () => {
		expect(
			auth.AuthTool.validateAuthArguments({
				function_call_id: "",
				auth_config: { authScheme: { type: "http" } },
			}),
		).toBe(true);
		expect(
			auth.AuthTool.validateAuthArguments({
				function_call_id: null,
				auth_config: {},
			}),
		).toBe(false);
	});

	it("barrel EnhancedAuthConfig credentialKey empty generates adk_ key", () => {
		const enhanced = new auth.EnhancedAuthConfig({
			authScheme: new auth.ApiKeyScheme({ in: "header", name: "X" }),
			credentialKey: "",
		});
		expect(enhanced.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});

	it("barrel OAuth2Credential + AuthHandler refresh failure propagates", async () => {
		const credential = new auth.OAuth2Credential({
			accessToken: "old",
			refreshToken: "r",
			refreshFunction: async () => {
				throw new Error("refresh fail barrel");
			},
		});
		const handler = new auth.AuthHandler({
			authConfig: new auth.AuthConfig({
				authScheme: new auth.HttpScheme({ scheme: "bearer" }),
			}),
			credential,
		});
		await expect(handler.refreshToken()).rejects.toThrow(/refresh fail barrel/);
		expect(handler.getToken()).toBe("old");
	});

	it("barrel createAuthToolArguments preserves EnhancedAuthConfig credentialKey", () => {
		const enhanced = new auth.EnhancedAuthConfig({
			authScheme: new auth.HttpScheme({ scheme: "bearer" }),
			credentialKey: "barrel-key",
		});
		const args = auth.createAuthToolArguments("fc-b", enhanced);
		expect(auth.isEnhancedAuthConfig(args.auth_config)).toBe(true);
		expect(
			(args.auth_config as InstanceType<typeof auth.EnhancedAuthConfig>)
				.credentialKey,
		).toBe("barrel-key");
	});
});

describe("OAuth2Credential expiresAt skew leftover edges", () => {
	it("exactly 31 seconds remaining is not expired", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			expiresIn: 31,
		});
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it("refresh updates accessToken when refreshFunction returns only accessToken", async () => {
		const credential = new OAuth2Credential({
			accessToken: "before",
			refreshToken: "r",
			refreshFunction: async (rt) => {
				expect(rt).toBe("r");
				return { accessToken: "after" };
			},
		});
		await credential.refresh();
		expect(credential.getToken()).toBe("after");
		expect(credential.refreshToken).toBe("r");
		expect(credential.expiresAt).toBeUndefined();
	});
});
