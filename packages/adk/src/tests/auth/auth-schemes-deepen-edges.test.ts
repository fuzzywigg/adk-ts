import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyScheme,
	AuthSchemeType,
	HttpScheme,
	OAuth2Scheme,
	OpenIdConnectScheme,
} from "../../auth/auth-schemes";

describe("auth schemes deepen edges (TOKENMAXX after #153)", () => {
	it("preserves OAuth2Scheme empty flows object", () => {
		const flows = {};
		const scheme = new OAuth2Scheme({ flows });
		expect(scheme.type).toBe(AuthSchemeType.OAUTH2);
		expect(scheme.flows).toBe(flows);
	});

	it("preserves flow with empty scopes map", () => {
		const scheme = new OAuth2Scheme({
			flows: {
				authorizationCode: {
					authorizationUrl: "https://example.com/auth",
					tokenUrl: "https://example.com/token",
					scopes: {},
				},
			},
		});
		expect(scheme.flows.authorizationCode?.scopes).toEqual({});
	});

	it("ApiKeyScheme without description leaves description undefined", () => {
		const scheme = new ApiKeyScheme({ in: "header", name: "X-Key" });
		expect(scheme.description).toBeUndefined();
		expect(scheme.type).toBe(AuthSchemeType.APIKEY);
	});

	it("HttpScheme digest without bearerFormat", () => {
		const scheme = new HttpScheme({ scheme: "digest" });
		expect(scheme.scheme).toBe("digest");
		expect(scheme.bearerFormat).toBeUndefined();
		expect(scheme.type).toBe(AuthSchemeType.HTTP);
	});

	it("OpenIdConnectScheme stores empty URL string", () => {
		const scheme = new OpenIdConnectScheme({ openIdConnectUrl: "" });
		expect(scheme.openIdConnectUrl).toBe("");
		expect(scheme.type).toBe(AuthSchemeType.OPENID_CONNECT);
	});

	it("AuthConfig with and without context preserves reference equality", () => {
		const authScheme = new ApiKeyScheme({ in: "query", name: "key" });
		const context = { requestId: "r1" };
		const withCtx = new AuthConfig({ authScheme, context } as any);
		const withoutCtx = new AuthConfig({ authScheme });
		expect(withCtx.authScheme).toBe(authScheme);
		expect(withoutCtx.authScheme).toBe(authScheme);
		expect((withCtx as any).context).toBe(context);
	});

	it("enum string values match OpenAPI-ish literals", () => {
		expect(AuthSchemeType.APIKEY).toBe("apiKey");
		expect(AuthSchemeType.HTTP).toBe("http");
		expect(AuthSchemeType.OAUTH2).toBe("oauth2");
		expect(AuthSchemeType.OPENID_CONNECT).toBe("openIdConnect");
	});

	it("HttpScheme bearer with bearerFormat retained", () => {
		const scheme = new HttpScheme({
			scheme: "bearer",
			bearerFormat: "JWT",
			description: "Bearer JWT",
		});
		expect(scheme.bearerFormat).toBe("JWT");
		expect(scheme.description).toBe("Bearer JWT");
	});
});
