import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyScheme,
	AuthSchemeType,
	HttpScheme,
	OAuth2Scheme,
	OpenIdConnectScheme,
} from "../../auth/auth-schemes";

describe("auth schemes", () => {
	it("builds API key schemes", () => {
		const scheme = new ApiKeyScheme({
			in: "header",
			name: "X-API-Key",
			description: "API key header",
		});

		expect(scheme.type).toBe(AuthSchemeType.APIKEY);
		expect(scheme.in).toBe("header");
		expect(scheme.name).toBe("X-API-Key");
		expect(scheme.description).toBe("API key header");
	});

	it("builds HTTP schemes", () => {
		const scheme = new HttpScheme({
			scheme: "bearer",
			bearerFormat: "JWT",
		});

		expect(scheme.type).toBe(AuthSchemeType.HTTP);
		expect(scheme.scheme).toBe("bearer");
		expect(scheme.bearerFormat).toBe("JWT");
	});

	it("builds OAuth2 schemes with flows", () => {
		const scheme = new OAuth2Scheme({
			flows: {
				authorizationCode: {
					authorizationUrl: "https://example.com/auth",
					tokenUrl: "https://example.com/token",
					scopes: { read: "Read access" },
				},
			},
			description: "OAuth2",
		});

		expect(scheme.type).toBe(AuthSchemeType.OAUTH2);
		expect(scheme.flows.authorizationCode?.scopes.read).toBe("Read access");
		expect(scheme.description).toBe("OAuth2");
	});

	it("builds OpenID Connect schemes", () => {
		const scheme = new OpenIdConnectScheme({
			openIdConnectUrl: "https://example.com/.well-known/openid",
		});

		expect(scheme.type).toBe(AuthSchemeType.OPENID_CONNECT);
		expect(scheme.openIdConnectUrl).toContain("openid");
	});
});

describe("AuthConfig", () => {
	it("stores scheme and optional context", () => {
		const authScheme = new ApiKeyScheme({ in: "query", name: "key" });
		const config = new AuthConfig({
			authScheme,
			context: { audience: "api" },
		});

		expect(config.authScheme).toBe(authScheme);
		expect(config.context).toEqual({ audience: "api" });
	});

	it("allows omitting context", () => {
		const config = new AuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
		});
		expect(config.context).toBeUndefined();
	});
});
