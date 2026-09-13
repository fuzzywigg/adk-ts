import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	AuthCredentialType,
	ApiKeyCredential,
} from "../../auth/auth-credential";
import { ApiKeyScheme, HttpScheme } from "../../auth/auth-schemes";
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
		expect(AuthTool.validateAuthArguments(null)).toBe(false);
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
		).toBe(false);
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
