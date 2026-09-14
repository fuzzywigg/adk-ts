import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../../auth/auth-config";
import {
	ApiKeyCredential,
	AuthCredential,
	AuthCredentialType,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../../auth/auth-credential";
import { AuthHandler } from "../../../auth/auth-handler";
import {
	ApiKeyScheme,
	AuthSchemeType,
	HttpScheme,
	OAuth2Scheme,
	OpenIdConnectScheme,
} from "../../../auth/auth-schemes";
import {
	AuthTool,
	createAuthToolArguments,
	EnhancedAuthConfig,
	isEnhancedAuthConfig,
} from "../../../auth/auth-tool";

describe("AuthHandler leftover: optional credential arms", () => {
	const authConfig = new AuthConfig({
		authScheme: new HttpScheme({ scheme: "bearer" }),
	});

	it("getToken/getHeaders/refreshToken no-op without credential", async () => {
		const handler = new AuthHandler({ authConfig });
		expect(handler.getToken()).toBeUndefined();
		expect(handler.getHeaders()).toEqual({});
		await expect(handler.refreshToken()).resolves.toBeUndefined();
	});

	it("delegates getToken/getHeaders when credential present", () => {
		const credential = {
			getToken: vi.fn().mockReturnValue("tok"),
			getHeaders: vi.fn().mockReturnValue({ Authorization: "Bearer tok" }),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as any;
		const handler = new AuthHandler({ authConfig, credential });
		expect(handler.getToken()).toBe("tok");
		expect(handler.getHeaders()).toEqual({ Authorization: "Bearer tok" });
		expect(credential.getHeaders).toHaveBeenCalledWith(authConfig);
	});

	it("refreshToken only when canRefresh is true", async () => {
		const refreshable = {
			getToken: vi.fn(),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(true),
			refresh: vi.fn().mockResolvedValue(undefined),
		} as any;
		await new AuthHandler({
			authConfig,
			credential: refreshable,
		}).refreshToken();
		expect(refreshable.refresh).toHaveBeenCalled();

		const blocked = {
			getToken: vi.fn(),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as any;
		await new AuthHandler({ authConfig, credential: blocked }).refreshToken();
		expect(blocked.refresh).not.toHaveBeenCalled();
	});
});

describe("Auth schemes leftover: ApiKey header/query/cookie + HTTP variants", () => {
	const locations: Array<"header" | "query" | "cookie"> = [
		"header",
		"query",
		"cookie",
	];

	for (const location of locations) {
		it(`ApiKeyCredential getHeaders for in=${location}`, () => {
			const scheme = new ApiKeyScheme({ in: location, name: "X-Key" });
			const credential = new ApiKeyCredential("secret");
			const handler = new AuthHandler({
				authConfig: new AuthConfig({ authScheme: scheme }),
				credential,
			});
			expect(handler.getToken()).toBe("secret");
			if (location === "header") {
				expect(handler.getHeaders()).toEqual({ "X-Key": "secret" });
			} else {
				expect(handler.getHeaders()).toEqual({});
			}
		});
	}

	it("HttpScheme variants set type HTTP with optional bearerFormat", () => {
		const variants: Array<{
			scheme: "basic" | "bearer" | "digest" | "other";
			bearerFormat?: string;
		}> = [
			{ scheme: "basic" },
			{ scheme: "bearer", bearerFormat: "JWT" },
			{ scheme: "digest" },
			{ scheme: "other" },
		];
		for (const row of variants) {
			const s = new HttpScheme(row);
			expect(s.type).toBe(AuthSchemeType.HTTP);
			expect(s.scheme).toBe(row.scheme);
			expect(s.bearerFormat).toBe(row.bearerFormat);
		}
	});

	it("OAuth2 and OpenIdConnect scheme constructors preserve optional description", () => {
		const oauth = new OAuth2Scheme({
			flows: {
				authorizationCode: {
					authorizationUrl: "https://a/auth",
					tokenUrl: "https://a/token",
					scopes: { read: "r" },
				},
			},
		});
		expect(oauth.type).toBe(AuthSchemeType.OAUTH2);
		expect(oauth.description).toBeUndefined();

		const oidc = new OpenIdConnectScheme({
			openIdConnectUrl: "https://a/.well-known",
			description: "oidc",
		});
		expect(oidc.type).toBe(AuthSchemeType.OPENID_CONNECT);
		expect(oidc.description).toBe("oidc");
	});
});

describe("Auth credential leftover: OAuth2 canRefresh/isExpired/refresh arms", () => {
	it("canRefresh requires both refreshToken and refreshFunction", () => {
		const matrix: Array<{
			label: string;
			refreshToken?: string;
			refreshFunction?: () => Promise<any>;
			expected: boolean;
		}> = [
			{ label: "neither", expected: false },
			{ label: "token only", refreshToken: "r", expected: false },
			{
				label: "fn only",
				refreshFunction: async () => ({ accessToken: "n" }),
				expected: false,
			},
			{
				label: "both",
				refreshToken: "r",
				refreshFunction: async () => ({ accessToken: "n" }),
				expected: true,
			},
			{
				label: "empty token is falsy",
				refreshToken: "",
				refreshFunction: async () => ({ accessToken: "n" }),
				expected: false,
			},
		];
		for (const row of matrix) {
			const cred = new OAuth2Credential({
				accessToken: "a",
				refreshToken: row.refreshToken,
				refreshFunction: row.refreshFunction,
			});
			expect(cred.canRefresh()).toBe(row.expected);
		}
	});

	it("isExpired false without expiresAt; true near expiry window", () => {
		const noExpiry = new OAuth2Credential({ accessToken: "a" });
		expect(noExpiry.isExpired()).toBe(false);

		const far = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 3600,
		});
		expect(far.isExpired()).toBe(false);

		const near = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 10,
		});
		expect(near.isExpired()).toBe(true);
	});

	it("refresh throws when cannot refresh or refreshFunction returns falsy", async () => {
		const bare = new OAuth2Credential({ accessToken: "a" });
		await expect(bare.refresh()).rejects.toThrow("Cannot refresh token");

		const emptyResult = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			refreshFunction: async () => undefined as any,
		});
		await expect(emptyResult.refresh()).rejects.toThrow(
			"Failed to refresh token",
		);
	});

	it("refresh updates access/refresh/expiry when provided", async () => {
		const cred = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "r1",
			expiresIn: 60,
			refreshFunction: async () => ({
				accessToken: "new",
				refreshToken: "r2",
				expiresIn: 120,
			}),
		});
		await cred.refresh();
		expect(cred.getToken()).toBe("new");
		expect(cred.refreshToken).toBe("r2");
		expect(cred.isExpired()).toBe(false);
		expect(cred.getHeaders()).toEqual({ Authorization: "Bearer new" });
	});

	it("refresh keeps prior refreshToken when result omits it", async () => {
		const cred = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "keep",
			refreshFunction: async () => ({ accessToken: "new" }),
		});
		await cred.refresh();
		expect(cred.refreshToken).toBe("keep");
		expect(cred.getToken()).toBe("new");
	});

	it("Basic/Bearer headers and base AuthCredential refresh defaults", async () => {
		const basic = new BasicAuthCredential("u", "p");
		expect(basic.getToken()).toBe(Buffer.from("u:p").toString("base64"));
		expect(basic.getHeaders()).toEqual({
			Authorization: `Basic ${basic.getToken()}`,
		});
		expect(basic.canRefresh()).toBe(false);
		await expect(basic.refresh()).rejects.toThrow(
			"Token refresh not supported",
		);

		const bearer = new BearerTokenCredential("abc");
		expect(bearer.getToken()).toBe("abc");
		expect(bearer.getHeaders()).toEqual({ Authorization: "Bearer abc" });
		expect(bearer.type).toBe(AuthCredentialType.BEARER);
	});
});

describe("AuthTool / EnhancedAuthConfig leftover: key coalesce + catch", () => {
	it("EnhancedAuthConfig coalesces missing scheme/credential types in key", () => {
		const scheme = { type: undefined } as any;
		const config = new EnhancedAuthConfig({
			authScheme: scheme,
		});
		expect(config.getCredentialKey()).toMatch(/^adk_unknown_none_\d+$/);

		const withCred = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
			rawAuthCredential: new BearerTokenCredential("t"),
		});
		expect(withCred.getCredentialKey()).toMatch(/^adk_http_bearer_\d+$/);
	});

	it("getCredentialKey regenerates when credentialKey cleared", () => {
		const config = new EnhancedAuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "k" }),
			credentialKey: "custom",
		});
		expect(config.getCredentialKey()).toBe("custom");
		config.credentialKey = undefined;
		expect(config.getCredentialKey()).toMatch(/^adk_apiKey_none_\d+$/);
	});

	it("processAuthRequest success and validateAuthArguments edges", async () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "bearer" }),
			credentialKey: "ck",
		});
		const ok = await AuthTool.processAuthRequest(
			createAuthToolArguments("fc-1", enhanced),
		);
		expect(ok).toEqual({
			status: "auth_request_processed",
			authConfig: enhanced,
			credentialKey: "ck",
		});

		const basic = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "X" }),
		});
		const basicResult = await AuthTool.processAuthRequest({
			function_call_id: "fc-2",
			auth_config: basic,
		});
		expect(basicResult.status).toBe("auth_request_processed");
		expect(basicResult.credentialKey).toMatch(/^adk_apiKey_\d+$/);

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
				function_call_id: "id",
				auth_config: { authScheme: {} },
			}),
		).toBe(true);
	});

	it("processAuthRequest catch returns auth_request_failed", async () => {
		const bad = {
			function_call_id: "fc",
			get auth_config() {
				throw new Error("explode");
			},
		} as any;
		await expect(AuthTool.processAuthRequest(bad)).resolves.toEqual({
			status: "auth_request_failed",
		});
	});

	it("isEnhancedAuthConfig type guard", () => {
		const enhanced = new EnhancedAuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
		});
		const basic = new AuthConfig({
			authScheme: new HttpScheme({ scheme: "basic" }),
		});
		expect(isEnhancedAuthConfig(enhanced)).toBe(true);
		expect(isEnhancedAuthConfig(basic)).toBe(false);
	});

	it("AuthCredential abstract defaults for custom subclass", async () => {
		class CustomCred extends AuthCredential {
			constructor() {
				super(AuthCredentialType.CUSTOM);
			}
			getToken() {
				return "c";
			}
			getHeaders() {
				return { "X-Custom": "c" };
			}
		}
		const cred = new CustomCred();
		expect(cred.type).toBe(AuthCredentialType.CUSTOM);
		expect(cred.canRefresh()).toBe(false);
		await expect(cred.refresh()).rejects.toThrow("Token refresh not supported");
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "other" }),
			}),
			credential: cred,
		});
		expect(handler.getToken()).toBe("c");
		expect(handler.getHeaders()).toEqual({ "X-Custom": "c" });
	});
});
