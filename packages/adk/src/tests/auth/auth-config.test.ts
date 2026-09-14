import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyScheme,
	HttpScheme,
	OAuth2Scheme,
	OpenIdConnectScheme,
} from "../../auth/auth-schemes";

describe("AuthConfig", () => {
	it("wraps an auth scheme with optional context", () => {
		const authScheme = new HttpScheme({
			scheme: "bearer",
			bearerFormat: "JWT",
		});
		const config = new AuthConfig({
			authScheme,
			context: { realm: "api" },
		});

		expect(config.authScheme).toBe(authScheme);
		expect(config.context?.realm).toBe("api");
	});

	it("works with OAuth2 schemes", () => {
		const authScheme = new OAuth2Scheme({
			flows: {
				clientCredentials: {
					tokenUrl: "https://example.com/token",
					scopes: { write: "Write" },
				},
			},
		});
		const config = new AuthConfig({ authScheme });
		expect(config.authScheme.type).toBe("oauth2");
		expect(config.context).toBeUndefined();
	});

	it("stores nested context values for ApiKey and OpenID schemes", () => {
		const apiKeyConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "cookie", name: "sid" }),
			context: { credentialKey: "temp:cookie", meta: { env: "test" } },
		});
		expect(apiKeyConfig.authScheme.type).toBe("apiKey");
		expect(apiKeyConfig.context?.credentialKey).toBe("temp:cookie");
		expect(apiKeyConfig.context?.meta).toEqual({ env: "test" });

		const oidcConfig = new AuthConfig({
			authScheme: new OpenIdConnectScheme({
				openIdConnectUrl: "https://example.com/.well-known/openid",
				description: "OIDC",
			}),
			context: {},
		});
		expect(oidcConfig.authScheme.type).toBe("openIdConnect");
		expect(oidcConfig.context).toEqual({});
	});

	it("preserves the same authScheme object reference across reads", () => {
		const authScheme = new HttpScheme({
			scheme: "digest",
			description: "digest realm",
		});
		const config = new AuthConfig({
			authScheme,
			context: { realm: "example" },
		});
		expect(config.authScheme).toBe(authScheme);
		expect(config.authScheme.description).toBe("digest realm");
		expect(config.context?.realm).toBe("example");
	});

	it("allows mutating context after construction", () => {
		const config = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "X-Key" }),
			context: { a: 1 },
		});
		config.context!.a = 2;
		config.context!.b = "added";
		expect(config.context).toEqual({ a: 2, b: "added" });
	});
});
