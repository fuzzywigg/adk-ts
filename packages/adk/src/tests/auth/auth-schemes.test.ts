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

	it("builds cookie and query API key schemes without description", () => {
		const cookie = new ApiKeyScheme({ in: "cookie", name: "sid" });
		const query = new ApiKeyScheme({ in: "query", name: "api_key" });

		expect(cookie.in).toBe("cookie");
		expect(cookie.description).toBeUndefined();
		expect(query.in).toBe("query");
		expect(query.name).toBe("api_key");
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

	it("builds digest and other HTTP schemes with description", () => {
		const digest = new HttpScheme({
			scheme: "digest",
			description: "Digest auth",
		});
		const other = new HttpScheme({ scheme: "other" });

		expect(digest.scheme).toBe("digest");
		expect(digest.description).toBe("Digest auth");
		expect(digest.bearerFormat).toBeUndefined();
		expect(other.scheme).toBe("other");
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

	it("builds OAuth2 schemes with implicit, password, and clientCredentials flows", () => {
		const scheme = new OAuth2Scheme({
			flows: {
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
		});

		expect(scheme.flows.implicit?.authorizationUrl).toContain("implicit");
		expect(scheme.flows.password?.scopes.write).toBe("Write");
		expect(scheme.flows.clientCredentials?.refreshUrl).toContain("refresh");
		expect(scheme.description).toBeUndefined();
	});

	it("builds OpenID Connect schemes", () => {
		const scheme = new OpenIdConnectScheme({
			openIdConnectUrl: "https://example.com/.well-known/openid",
		});

		expect(scheme.type).toBe(AuthSchemeType.OPENID_CONNECT);
		expect(scheme.openIdConnectUrl).toContain("openid");
	});

	it("stores OpenID Connect description when provided", () => {
		const scheme = new OpenIdConnectScheme({
			openIdConnectUrl: "https://example.com/.well-known/openid",
			description: "OIDC",
		});
		expect(scheme.description).toBe("OIDC");
	});

	it("exposes AuthSchemeType string values exhaustively", () => {
		expect(AuthSchemeType.APIKEY).toBe("apiKey");
		expect(AuthSchemeType.HTTP).toBe("http");
		expect(AuthSchemeType.OAUTH2).toBe("oauth2");
		expect(AuthSchemeType.OPENID_CONNECT).toBe("openIdConnect");
	});

	it("builds HTTP basic schemes with optional description", () => {
		const basic = new HttpScheme({
			scheme: "basic",
			description: "Basic auth",
		});
		expect(basic.scheme).toBe("basic");
		expect(basic.description).toBe("Basic auth");
		expect(basic.type).toBe(AuthSchemeType.HTTP);
	});

	it("builds OAuth2 schemes with empty flows and authorizationCode refreshUrl", () => {
		const empty = new OAuth2Scheme({ flows: {} });
		expect(empty.flows).toEqual({});
		expect(empty.type).toBe(AuthSchemeType.OAUTH2);

		const withRefresh = new OAuth2Scheme({
			flows: {
				authorizationCode: {
					authorizationUrl: "https://example.com/auth",
					tokenUrl: "https://example.com/token",
					refreshUrl: "https://example.com/refresh",
					scopes: { read: "Read" },
				},
			},
		});
		expect(withRefresh.flows.authorizationCode?.refreshUrl).toBe(
			"https://example.com/refresh",
		);
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
