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

describe("auth credentials + schemes + tool + config heavy matrix edges", () => {
	describe("credential type matrices", () => {
		it.each([
			[AuthCredentialType.BASIC, () => new BasicAuthCredential("u", "p")],
			[AuthCredentialType.BEARER, () => new BearerTokenCredential("tok")],
			[AuthCredentialType.API_KEY, () => new ApiKeyCredential("secret")],
			[
				AuthCredentialType.OAUTH2,
				() => new OAuth2Credential({ accessToken: "a" }),
			],
		])("credential type %s", (expectedType, factory) => {
			expect(factory().type).toBe(expectedType);
		});

		it("BasicAuthCredential builds Authorization headers", () => {
			const credential = new BasicAuthCredential("user", "pass");
			const expected = Buffer.from("user:pass").toString("base64");
			expect(credential.getToken()).toBe(expected);
			expect(credential.getHeaders()).toEqual({
				Authorization: `Basic ${expected}`,
			});
			expect(credential.canRefresh()).toBe(false);
		});

		it.each([
			["user:name", ""],
			["üser", "päss"],
			["", ""],
			["a", "b:c:d"],
		])("BasicAuth encodes username=%j password=%j", (user, pass) => {
			const credential = new BasicAuthCredential(user, pass);
			const expected = Buffer.from(`${user}:${pass}`).toString("base64");
			expect(credential.getToken()).toBe(expected);
		});

		it("BearerTokenCredential supports empty and unicode tokens", () => {
			expect(new BearerTokenCredential("").getToken()).toBe("");
			expect(new BearerTokenCredential("tokén-🔐").getHeaders()).toEqual({
				Authorization: "Bearer tokén-🔐",
			});
			expect(new BearerTokenCredential("t").canRefresh()).toBe(false);
		});

		it.each([
			["header", "X-API-Key", { "X-API-Key": "secret" }],
			["query", "api_key", {}],
			["cookie", "session", {}],
		] as const)("ApiKeyCredential in=%s name=%s → headers %j", (location, name, headers) => {
			const credential = new ApiKeyCredential("secret");
			const config = new AuthConfig({
				authScheme: new ApiKeyScheme({ in: location, name }),
			});
			expect(credential.getHeaders(config)).toEqual(headers);
		});

		it("ApiKeyCredential empty key still emits header", () => {
			const credential = new ApiKeyCredential("");
			const config = new AuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "X-Empty" }),
			});
			expect(credential.getHeaders(config)).toEqual({ "X-Empty": "" });
		});

		it("base AuthCredential refresh and canRefresh defaults", async () => {
			class Unsupported extends AuthCredential {
				getToken() {
					return "x";
				}
				getHeaders() {
					return {};
				}
			}
			const credential = new Unsupported(AuthCredentialType.CUSTOM);
			expect(credential.canRefresh()).toBe(false);
			await expect(credential.refresh()).rejects.toThrow(
				/Token refresh not supported/,
			);
		});
	});

	describe("OAuth2Credential expiry and refresh matrices", () => {
		it("tracks expiry and refresh capability with expiresIn", async () => {
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
			await credential.refresh();
			expect(credential.getToken()).toBe("next-access");
			expect(credential.refreshToken).toBe("next-refresh");
			expect(credential.isExpired()).toBe(false);
		});

		it.each([
			[{ accessToken: "a", refreshToken: "r" }, false],
			[
				{
					accessToken: "a",
					refreshFunction: async () => ({ accessToken: "b" }),
				},
				false,
			],
			[
				{
					accessToken: "a",
					refreshToken: "r",
					refreshFunction: async () => ({ accessToken: "b" }),
				},
				true,
			],
		])("canRefresh matrix %# → %s", (opts, expected) => {
			expect(new OAuth2Credential(opts as any).canRefresh()).toBe(expected);
		});

		it("rejects refresh without refresh function", async () => {
			const credential = new OAuth2Credential({ accessToken: "access" });
			await expect(credential.refresh()).rejects.toThrow(
				/Cannot refresh token/,
			);
		});

		it("throws when refresh function returns falsy payload", async () => {
			const credential = new OAuth2Credential({
				accessToken: "access",
				refreshToken: "refresh",
				refreshFunction: async () => undefined as any,
			});
			await expect(credential.refresh()).rejects.toThrow(
				/Failed to refresh token/,
			);
		});

		it("keeps prior refresh token when refresh payload omits it", async () => {
			const credential = new OAuth2Credential({
				accessToken: "access",
				refreshToken: "keep-me",
				refreshFunction: async () => ({ accessToken: "rotated" }),
			});
			await credential.refresh();
			expect(credential.getToken()).toBe("rotated");
			expect(credential.refreshToken).toBe("keep-me");
		});

		it("marks skew boundary correctly with fake timers", () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
			expect(
				new OAuth2Credential({ accessToken: "a", expiresIn: 30 }).isExpired(),
			).toBe(false);
			expect(
				new OAuth2Credential({ accessToken: "a", expiresIn: 29 }).isExpired(),
			).toBe(true);
			vi.useRealTimers();
		});

		it("treats expiresIn 0 as falsy and leaves expiresAt unset", () => {
			const credential = new OAuth2Credential({
				accessToken: "access",
				expiresIn: 0,
			});
			expect(credential.expiresAt).toBeUndefined();
			expect(credential.isExpired()).toBe(false);
		});

		it("propagates refresh function rejections", async () => {
			const credential = new OAuth2Credential({
				accessToken: "access",
				refreshToken: "refresh",
				refreshFunction: async () => {
					throw new Error("network down");
				},
			});
			await expect(credential.refresh()).rejects.toThrow(/network down/);
		});
	});

	describe("auth scheme matrices", () => {
		it("exposes AuthSchemeType enum values", () => {
			expect(AuthSchemeType).toEqual({
				APIKEY: "apiKey",
				HTTP: "http",
				OAUTH2: "oauth2",
				OPENID_CONNECT: "openIdConnect",
			});
		});

		it.each([
			["header", "X-API-Key"],
			["query", "api_key"],
			["cookie", "sid"],
		] as const)("ApiKeyScheme in=%s name=%s", (location, name) => {
			const scheme = new ApiKeyScheme({ in: location, name });
			expect(scheme.type).toBe(AuthSchemeType.APIKEY);
			expect(scheme.in).toBe(location);
			expect(scheme.name).toBe(name);
		});

		it.each([
			["bearer", "JWT"],
			["bearer", undefined],
			["basic", undefined],
			["digest", undefined],
		] as const)("HttpScheme scheme=%s bearerFormat=%s", (scheme, bearerFormat) => {
			const http = new HttpScheme({
				scheme,
				bearerFormat: bearerFormat as any,
			});
			expect(http.type).toBe(AuthSchemeType.HTTP);
			expect(http.scheme).toBe(scheme);
			expect(http.bearerFormat).toBe(bearerFormat);
		});

		it("builds OAuth2 with all flow kinds", () => {
			const scheme = new OAuth2Scheme({
				flows: {
					authorizationCode: {
						authorizationUrl: "https://example.com/auth",
						tokenUrl: "https://example.com/token",
						scopes: { read: "Read" },
					},
					implicit: {
						authorizationUrl: "https://example.com/implicit",
						scopes: { openid: "OpenID" },
					},
					password: {
						tokenUrl: "https://example.com/token",
						scopes: { write: "Write" },
					},
					clientCredentials: {
						tokenUrl: "https://example.com/token",
						refreshUrl: "https://example.com/refresh",
						scopes: { admin: "Admin" },
					},
				},
				description: "all-flows",
			});
			expect(scheme.type).toBe(AuthSchemeType.OAUTH2);
			expect(scheme.description).toBe("all-flows");
			expect(scheme.flows.authorizationCode?.scopes.read).toBe("Read");
			expect(scheme.flows.clientCredentials?.refreshUrl).toContain("refresh");
		});

		it("builds OpenIdConnect with and without description", () => {
			const bare = new OpenIdConnectScheme({
				openIdConnectUrl: "https://example.com/.well-known/openid",
			});
			expect(bare.type).toBe(AuthSchemeType.OPENID_CONNECT);
			expect(bare.description).toBeUndefined();
			const described = new OpenIdConnectScheme({
				openIdConnectUrl: "https://example.com/.well-known/openid",
				description: "OIDC",
			});
			expect(described.description).toBe("OIDC");
		});
	});

	describe("AuthConfig + AuthTool matrices", () => {
		it.each([
			new ApiKeyScheme({ in: "header", name: "k" }),
			new HttpScheme({ scheme: "bearer" }),
			new OAuth2Scheme({
				flows: {
					clientCredentials: {
						tokenUrl: "https://example.com/token",
						scopes: {},
					},
				},
			}),
			new OpenIdConnectScheme({
				openIdConnectUrl: "https://example.com/.well-known/openid",
			}),
		])("AuthConfig stores scheme %#", (authScheme) => {
			const config = new AuthConfig({
				authScheme,
				context: { audience: "api" },
			});
			expect(config.authScheme).toBe(authScheme);
			expect(config.context).toEqual({ audience: "api" });
		});

		it("AuthConfig allows omitting context and empty context", () => {
			expect(
				new AuthConfig({
					authScheme: new HttpScheme({ scheme: "basic" }),
				}).context,
			).toBeUndefined();
			expect(
				new AuthConfig({
					authScheme: new HttpScheme({ scheme: "basic" }),
					context: {},
				}).context,
			).toEqual({});
		});

		it("EnhancedAuthConfig auto-generates and regenerates credential keys", () => {
			const config = new EnhancedAuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "x-api-key" }),
				rawAuthCredential: new ApiKeyCredential("secret"),
			});
			expect(config.credentialKey).toMatch(/^adk_apiKey_api_key_\d+$/);
			config.credentialKey = undefined;
			expect(config.getCredentialKey()).toMatch(/^adk_apiKey_api_key_\d+$/);
		});

		it("EnhancedAuthConfig uses explicit credentialKey", () => {
			const config = new EnhancedAuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
				credentialKey: "custom-key",
			});
			expect(config.getCredentialKey()).toBe("custom-key");
		});

		it("falls back to unknown scheme key when type is empty", () => {
			const config = new EnhancedAuthConfig({
				authScheme: { type: "" } as any,
				rawAuthCredential: new ApiKeyCredential("secret"),
			});
			expect(config.getCredentialKey()).toMatch(/^adk_unknown_api_key_\d+$/);
		});

		it("AuthTool.validateAuthArguments accepts and rejects shapes", () => {
			expect(
				AuthTool.validateAuthArguments({
					function_call_id: "fc-1",
					auth_config: { authScheme: { type: "http" } },
				}),
			).toBe(true);
			expect(AuthTool.validateAuthArguments(undefined)).toBe(false);
			expect(AuthTool.validateAuthArguments({})).toBe(false);
			expect(() => AuthTool.validateAuthArguments(null)).toThrow();
			expect(
				AuthTool.validateAuthArguments({
					function_call_id: 1,
					auth_config: {},
				}),
			).toBe(false);
			expect(AuthTool.validateAuthArguments("fc")).toBe(false);
		});

		it("processAuthRequest succeeds for Enhanced and plain AuthConfig", async () => {
			const enhanced = new EnhancedAuthConfig({
				authScheme: new ApiKeyScheme({ in: "query", name: "key" }),
				credentialKey: "stored-key",
			});
			const enhancedResult = await AuthTool.processAuthRequest({
				function_call_id: "fc-1",
				auth_config: enhanced,
			});
			expect(enhancedResult).toEqual({
				status: "auth_request_processed",
				authConfig: enhanced,
				credentialKey: "stored-key",
			});

			const plain = new AuthConfig({
				authScheme: new HttpScheme({ scheme: "basic" }),
			});
			const plainResult = await AuthTool.processAuthRequest({
				function_call_id: "fc-2",
				auth_config: plain,
			});
			expect(plainResult.status).toBe("auth_request_processed");
			expect(plainResult.credentialKey).toMatch(/^adk_http_\d+$/);
		});

		it("processAuthRequest returns failed when key generation throws", async () => {
			const authConfig = new EnhancedAuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "x-api-key" }),
			});
			vi.spyOn(authConfig, "getCredentialKey").mockImplementation(() => {
				throw new Error("key boom");
			});
			await expect(
				AuthTool.processAuthRequest({
					function_call_id: "fc-fail",
					auth_config: authConfig,
				}),
			).resolves.toEqual({ status: "auth_request_failed" });
		});

		it("createAuthToolArguments and isEnhancedAuthConfig", () => {
			const plain = new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			});
			const enhanced = new EnhancedAuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "x-key" }),
			});
			expect(createAuthToolArguments("fc-9", plain)).toEqual({
				function_call_id: "fc-9",
				auth_config: plain,
			});
			expect(isEnhancedAuthConfig(enhanced)).toBe(true);
			expect(isEnhancedAuthConfig(plain)).toBe(false);
			expect(
				isEnhancedAuthConfig({
					authScheme: new ApiKeyScheme({ in: "header", name: "x" }),
					credentialKey: "lookalike",
				} as any),
			).toBe(false);
		});

		it("generateCredentialKey uses oauth2 scheme and credential types", () => {
			const config = new EnhancedAuthConfig({
				authScheme: new OAuth2Scheme({
					flows: {
						authorizationCode: {
							authorizationUrl: "https://example.com/auth",
							tokenUrl: "https://example.com/token",
							scopes: {},
						},
					},
				}),
				rawAuthCredential: {
					type: AuthCredentialType.OAUTH2,
					getToken: () => "t",
					getHeaders: () => ({}),
					canRefresh: () => false,
					refresh: async () => undefined,
				} as any,
			});
			expect(config.getCredentialKey()).toMatch(/^adk_oauth2_oauth2_\d+$/);
		});
	});
});
