import { describe, expect, it } from "vitest";
import * as auth from "../../auth";

describe("auth barrel exports", () => {
	it("exposes config, schemes, credentials, and handler constructors", () => {
		expect(typeof auth.AuthConfig).toBe("function");
		expect(typeof auth.AuthHandler).toBe("function");
		expect(typeof auth.ApiKeyScheme).toBe("function");
		expect(typeof auth.HttpScheme).toBe("function");
		expect(typeof auth.OAuth2Scheme).toBe("function");
		expect(typeof auth.OpenIdConnectScheme).toBe("function");
		expect(typeof auth.ApiKeyCredential).toBe("function");
		expect(typeof auth.BasicAuthCredential).toBe("function");
		expect(typeof auth.BearerTokenCredential).toBe("function");
		expect(typeof auth.OAuth2Credential).toBe("function");
	});

	it("exposes enum values for scheme and credential types", () => {
		expect(auth.AuthSchemeType.APIKEY).toBe("apiKey");
		expect(auth.AuthSchemeType.HTTP).toBe("http");
		expect(auth.AuthSchemeType.OAUTH2).toBe("oauth2");
		expect(auth.AuthSchemeType.OPENID_CONNECT).toBe("openIdConnect");
		expect(auth.AuthCredentialType.API_KEY).toBe("api_key");
		expect(auth.AuthCredentialType.BASIC).toBe("basic");
		expect(auth.AuthCredentialType.BEARER).toBe("bearer");
		expect(auth.AuthCredentialType.OAUTH2).toBe("oauth2");
		expect(auth.AuthCredentialType.CUSTOM).toBe("custom");
	});

	it("exposes auth tool helpers and requestProcessor", () => {
		expect(typeof auth.EnhancedAuthConfig).toBe("function");
		expect(typeof auth.AuthTool).toBe("function");
		expect(typeof auth.createAuthToolArguments).toBe("function");
		expect(typeof auth.isEnhancedAuthConfig).toBe("function");
		expect(auth.requestProcessor).toBeDefined();
		expect(typeof auth.requestProcessor.runAsync).toBe("function");
	});

	it("round-trips a minimal AuthConfig + ApiKeyCredential via public exports", () => {
		const scheme = new auth.ApiKeyScheme({ in: "header", name: "X-Key" });
		const config = new auth.AuthConfig({
			authScheme: scheme,
			context: { credentialKey: "temp:round" },
		});
		const credential = new auth.ApiKeyCredential("secret");
		const handler = new auth.AuthHandler({ authConfig: config, credential });

		expect(handler.getToken()).toBe("secret");
		expect(handler.getHeaders()).toEqual({ "X-Key": "secret" });
		expect(auth.isEnhancedAuthConfig(config)).toBe(false);

		const enhanced = new auth.EnhancedAuthConfig({
			authScheme: scheme,
			rawAuthCredential: credential,
			credentialKey: "round-key",
		});
		expect(auth.isEnhancedAuthConfig(enhanced)).toBe(true);
		expect(
			auth.createAuthToolArguments("fc-1", enhanced).function_call_id,
		).toBe("fc-1");
	});
});
