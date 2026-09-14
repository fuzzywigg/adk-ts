import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	AuthCredentialType,
	ApiKeyCredential,
} from "../../auth/auth-credential";
import {
	ApiKeyScheme,
	HttpScheme,
	OAuth2Scheme,
} from "../../auth/auth-schemes";
import {
	AuthTool,
	createAuthToolArguments,
	EnhancedAuthConfig,
	isEnhancedAuthConfig,
} from "../../auth/auth-tool";

describe("EnhancedAuthConfig", () => {
	it("auto-generates a credential key with the adk_ pattern", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x-api-key" }),
			rawAuthCredential: new ApiKeyCredential("secret"),
		});

		expect(config.credentialKey).toMatch(/^adk_apiKey_api_key_\d+$/);
		expect(config.getCredentialKey()).toBe(config.credentialKey);
	});

	it("uses an explicit credentialKey when provided", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
			credentialKey: "custom-key",
		});

		expect(config.getCredentialKey()).toBe("custom-key");
	});

	it("regenerates via getCredentialKey when credentialKey is cleared", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
			credentialKey: "temp",
		});
		config.credentialKey = undefined;
		expect(config.getCredentialKey()).toMatch(/^adk_http_none_\d+$/);
	});
});

describe("AuthTool", () => {
	it("validateAuthArguments accepts well-formed args", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: { authScheme: { type: "http" } },
			}),
		).toBe(true);
	});

	it("validateAuthArguments rejects malformed args", () => {
		expect(() => AuthTool.validateAuthArguments(null)).toThrow();
		expect(AuthTool.validateAuthArguments(undefined)).toBe(false);
		expect(AuthTool.validateAuthArguments({})).toBe(false);
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: 1,
				auth_config: {},
			}),
		).toBe(false);
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: null,
			}),
		).toBeFalsy();
	});

	it("processAuthRequest succeeds for EnhancedAuthConfig", async () => {
		const authConfig = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "query", name: "key" }),
			credentialKey: "stored-key",
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-1",
			auth_config: authConfig,
		});

		expect(result.status).toBe("auth_request_processed");
		expect(result.authConfig).toBe(authConfig);
		expect(result.credentialKey).toBe("stored-key");
	});

	it("processAuthRequest succeeds for plain AuthConfig", async () => {
		const authConfig = new AuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-2",
			auth_config: authConfig,
		});

		expect(result.status).toBe("auth_request_processed");
		expect(result.authConfig).toBe(authConfig);
		expect(result.credentialKey).toMatch(/^adk_http_\d+$/);
	});

	it("processAuthRequest returns auth_request_failed when key generation throws", async () => {
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
});

describe("createAuthToolArguments / isEnhancedAuthConfig", () => {
	it("createAuthToolArguments builds typed args", () => {
		const authConfig = new AuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
		});
		const args = createAuthToolArguments("fc-9", authConfig);
		expect(args).toEqual({
			function_call_id: "fc-9",
			auth_config: authConfig,
		});
	});

	it("isEnhancedAuthConfig distinguishes Enhanced from plain", () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x-key" }),
		});
		const plain = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x-key" }),
		});

		expect(isEnhancedAuthConfig(enhanced)).toBe(true);
		expect(isEnhancedAuthConfig(plain)).toBe(false);
		expect(enhanced.rawAuthCredential?.type).toBeUndefined();
		expect(AuthCredentialType.API_KEY).toBe("api_key");
	});
});

describe("EnhancedAuthConfig leftover edges", () => {
	it("falls back to unknown scheme key when authScheme.type is empty", () => {
		const config = new EnhancedAuthConfig({
			authScheme: { type: "" } as any,
			rawAuthCredential: new ApiKeyCredential("secret"),
		});
		expect(config.getCredentialKey()).toMatch(/^adk_unknown_api_key_\d+$/);
	});

	it("preserves exchangedAuthCredential and context on construct", () => {
		const exchanged = new ApiKeyCredential("exchanged");
		const config = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x-api-key" }),
			rawAuthCredential: new ApiKeyCredential("raw"),
			exchangedAuthCredential: exchanged,
			context: { audience: "svc", nested: { a: 1 } },
			credentialKey: "keep-me",
		});

		expect(config.exchangedAuthCredential).toBe(exchanged);
		expect(config.rawAuthCredential?.type).toBe(AuthCredentialType.API_KEY);
		expect(config.context).toEqual({ audience: "svc", nested: { a: 1 } });
		expect(config.getCredentialKey()).toBe("keep-me");
	});

	it("uses none credential segment when rawAuthCredential is omitted", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
		});
		expect(config.getCredentialKey()).toMatch(/^adk_http_none_\d+$/);
	});
});

describe("AuthTool leftover edges", () => {
	it("processAuthRequest auto-generates key for EnhancedAuthConfig without credentialKey", async () => {
		const authConfig = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x-api-key" }),
			rawAuthCredential: new ApiKeyCredential("secret"),
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-auto",
			auth_config: authConfig,
		});

		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toMatch(/^adk_apiKey_api_key_\d+$/);
		expect(result.authConfig).toBe(authConfig);
	});

	it("processAuthRequest uses plain AuthConfig scheme type in generated key", async () => {
		const authConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "query", name: "key" }),
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-plain-key",
			auth_config: authConfig,
		});
		expect(result.status).toBe("auth_request_processed");
		expect(result.credentialKey).toMatch(/^adk_apiKey_\d+$/);
	});

	it("validateAuthArguments rejects non-object and missing auth_config shapes", () => {
		expect(AuthTool.validateAuthArguments("fc")).toBe(false);
		expect(AuthTool.validateAuthArguments(42)).toBe(false);
		expect(AuthTool.validateAuthArguments([])).toBe(false);
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
			}),
		).toBeFalsy();
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "fc-1",
				auth_config: "not-object",
			}),
		).toBe(false);
	});

	it("createAuthToolArguments accepts EnhancedAuthConfig", () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
			credentialKey: "enh-key",
		});
		const args = createAuthToolArguments("fc-enh", enhanced);
		expect(args.function_call_id).toBe("fc-enh");
		expect(args.auth_config).toBe(enhanced);
		expect(isEnhancedAuthConfig(args.auth_config)).toBe(true);
	});

	it("isEnhancedAuthConfig is false for plain objects that look enhanced", () => {
		const lookalike = {
			authScheme: new ApiKeyScheme({ in: "header", name: "x" }),
			credentialKey: "adk_lookalike",
			rawAuthCredential: new ApiKeyCredential("k"),
		};
		expect(isEnhancedAuthConfig(lookalike as any)).toBe(false);
	});

	it("generateCredentialKey uses oauth2 scheme and oauth2 credential types", () => {
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

	it("processAuthRequest returns failed status for throwing plain AuthConfig access", async () => {
		const authConfig = new AuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
		});
		Object.defineProperty(authConfig, "authScheme", {
			get() {
				throw new Error("scheme boom");
			},
		});
		await expect(
			AuthTool.processAuthRequest({
				function_call_id: "fc-throw",
				auth_config: authConfig,
			}),
		).resolves.toEqual({ status: "auth_request_failed" });
	});

	it("getCredentialKey regenerates distinct keys after clearing credentialKey", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x" }),
			rawAuthCredential: new ApiKeyCredential("k"),
		});
		config.credentialKey = undefined;
		const first = config.getCredentialKey();
		config.credentialKey = undefined;
		const second = config.getCredentialKey();
		expect(first).toMatch(/^adk_apiKey_api_key_\d+$/);
		expect(second).toMatch(/^adk_apiKey_api_key_\d+$/);
	});

	it("validateAuthArguments accepts EnhancedAuthConfig instances", () => {
		const args = createAuthToolArguments(
			"fc-valid",
			new EnhancedAuthConfig({
				authScheme: new HttpScheme({ scheme: "basic" }),
			}),
		);
		expect(AuthTool.validateAuthArguments(args)).toBe(true);
	});
});

describe("AuthTool leftover success payload edges", () => {
	it("processAuthRequest success payload omits function_call_id", async () => {
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-ignored",
			auth_config: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			}),
		});

		expect(result.status).toBe("auth_request_processed");
		expect(result).not.toHaveProperty("function_call_id");
		expect(Object.keys(result).sort()).toEqual([
			"authConfig",
			"credentialKey",
			"status",
		]);
	});

	it("processAuthRequest failure payload only includes status", async () => {
		const authConfig = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "x-api-key" }),
		});
		vi.spyOn(authConfig, "getCredentialKey").mockImplementation(() => {
			throw new Error("fail");
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "fc-fail-shape",
			auth_config: authConfig,
		});
		expect(result).toEqual({ status: "auth_request_failed" });
		expect(result).not.toHaveProperty("function_call_id");
	});
});
