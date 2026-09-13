import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyScheme } from "../../auth/auth-schemes";
import {
	AuthTool,
	createAuthToolArguments,
	EnhancedAuthConfig,
	isEnhancedAuthConfig,
} from "../../auth/auth-tool";

function makeApiKeyScheme(): ApiKeyScheme {
	return new ApiKeyScheme({
		in: "header",
		name: "X-Fake-API-Key",
		description: "Fake API key scheme for tests",
	});
}

describe("EnhancedAuthConfig", () => {
	it("stores scheme fields and generates a credential key", () => {
		const authScheme = makeApiKeyScheme();
		const config = new EnhancedAuthConfig({
			authScheme,
			context: { source: "test" },
		});

		expect(config.authScheme).toBe(authScheme);
		expect(config.context?.source).toBe("test");
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_/);
	});

	it("uses an explicit credentialKey when provided", () => {
		const config = new EnhancedAuthConfig({
			authScheme: makeApiKeyScheme(),
			credentialKey: "adk_explicit_key",
		});

		expect(config.getCredentialKey()).toBe("adk_explicit_key");
	});
});

describe("AuthTool", () => {
	it("processAuthRequest returns credential key for EnhancedAuthConfig", async () => {
		const authConfig = new EnhancedAuthConfig({
			authScheme: makeApiKeyScheme(),
			credentialKey: "adk_test_key",
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "call-1",
			auth_config: authConfig,
		});

		expect(result).toEqual({
			status: "auth_request_processed",
			authConfig,
			credentialKey: "adk_test_key",
		});
	});

	it("processAuthRequest generates a key for basic AuthConfig", async () => {
		const authConfig = new AuthConfig({
			authScheme: makeApiKeyScheme(),
		});
		const result = await AuthTool.processAuthRequest({
			function_call_id: "call-2",
			auth_config: authConfig,
		});

		expect(result.status).toBe("auth_request_processed");
		expect(result.authConfig).toBe(authConfig);
		expect(result.credentialKey).toMatch(/^adk_apiKey_/);
	});

	it("validateAuthArguments accepts valid shapes and rejects invalid ones", () => {
		expect(
			AuthTool.validateAuthArguments({
				function_call_id: "call-3",
				auth_config: { authScheme: makeApiKeyScheme() },
			}),
		).toBe(true);

		expect(AuthTool.validateAuthArguments(undefined)).toBeFalsy();
		expect(AuthTool.validateAuthArguments({ function_call_id: 1 })).toBeFalsy();
		expect(
			AuthTool.validateAuthArguments({ function_call_id: "x" }),
		).toBeFalsy();
	});
});

describe("createAuthToolArguments and isEnhancedAuthConfig", () => {
	it("creates typed auth tool arguments", () => {
		const authConfig = new EnhancedAuthConfig({
			authScheme: makeApiKeyScheme(),
		});
		const args = createAuthToolArguments("call-4", authConfig);

		expect(args).toEqual({
			function_call_id: "call-4",
			auth_config: authConfig,
		});
	});

	it("detects EnhancedAuthConfig instances", () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: makeApiKeyScheme(),
		});
		const basic = new AuthConfig({
			authScheme: makeApiKeyScheme(),
		});

		expect(isEnhancedAuthConfig(enhanced)).toBe(true);
		expect(isEnhancedAuthConfig(basic)).toBe(false);
	});
});
