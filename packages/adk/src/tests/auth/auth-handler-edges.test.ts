import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	type AuthCredential,
	AuthCredentialType,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
import { AuthHandler } from "../../auth/auth-handler";
import { ApiKeyScheme, HttpScheme } from "../../auth/auth-schemes";

const PLACEHOLDER_TOKEN = "test-token-placeholder";
const PLACEHOLDER_KEY = "test-api-key-placeholder";

describe("AuthHandler leftover edges", () => {
	describe("constructor and property exposure", () => {
		it("stores authConfig and leaves credential undefined by default", () => {
			const authConfig = new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			});
			const handler = new AuthHandler({ authConfig });
			expect(handler.authConfig).toBe(authConfig);
			expect(handler.credential).toBeUndefined();
		});

		it("stores optional credential by reference", () => {
			const credential = new BearerTokenCredential(PLACEHOLDER_TOKEN);
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			});
			expect(handler.credential).toBe(credential);
			expect(handler.credential?.type).toBe(AuthCredentialType.BEARER);
		});

		it("preserves AuthConfig.context when present", () => {
			const authConfig = new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
				context: { audience: "tools", scopes: ["read"] },
			});
			const handler = new AuthHandler({ authConfig });
			expect(handler.authConfig.context).toEqual({
				audience: "tools",
				scopes: ["read"],
			});
		});
	});

	describe("getToken / getHeaders matrix without inventing live secrets", () => {
		it.each([
			{
				label: "bearer",
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential: new BearerTokenCredential(PLACEHOLDER_TOKEN),
				token: PLACEHOLDER_TOKEN,
				headers: { Authorization: `Bearer ${PLACEHOLDER_TOKEN}` },
			},
			{
				label: "basic",
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "basic" }),
				}),
				credential: new BasicAuthCredential("test-user", "test-pass"),
				token: Buffer.from("test-user:test-pass").toString("base64"),
				headers: {
					Authorization: `Basic ${Buffer.from("test-user:test-pass").toString("base64")}`,
				},
			},
			{
				label: "apiKey header",
				authConfig: new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "header", name: "X-Test-Key" }),
				}),
				credential: new ApiKeyCredential(PLACEHOLDER_KEY),
				token: PLACEHOLDER_KEY,
				headers: { "X-Test-Key": PLACEHOLDER_KEY },
			},
			{
				label: "apiKey query",
				authConfig: new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "query", name: "api_key" }),
				}),
				credential: new ApiKeyCredential(PLACEHOLDER_KEY),
				token: PLACEHOLDER_KEY,
				headers: {},
			},
			{
				label: "apiKey cookie",
				authConfig: new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "cookie", name: "sid" }),
				}),
				credential: new ApiKeyCredential(PLACEHOLDER_KEY),
				token: PLACEHOLDER_KEY,
				headers: {},
			},
		])("$label credential surfaces token and headers", ({
			authConfig,
			credential,
			token,
			headers,
		}) => {
			const handler = new AuthHandler({ authConfig, credential });
			expect(handler.getToken()).toBe(token);
			expect(handler.getHeaders()).toEqual(headers);
		});

		it("returns undefined token and empty headers without credential", () => {
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
			});
			expect(handler.getToken()).toBeUndefined();
			expect(handler.getHeaders()).toEqual({});
		});

		it("forwards authConfig into credential.getHeaders exactly once per call", () => {
			const authConfig = new AuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "X-Key" }),
			});
			const getHeaders = vi.fn().mockReturnValue({ "X-Key": PLACEHOLDER_KEY });
			const credential = {
				getToken: vi.fn().mockReturnValue(PLACEHOLDER_KEY),
				getHeaders,
				canRefresh: vi.fn().mockReturnValue(false),
				refresh: vi.fn(),
			} as unknown as AuthCredential;
			const handler = new AuthHandler({ authConfig, credential });
			expect(handler.getHeaders()).toEqual({ "X-Key": PLACEHOLDER_KEY });
			expect(handler.getHeaders()).toEqual({ "X-Key": PLACEHOLDER_KEY });
			expect(getHeaders).toHaveBeenCalledTimes(2);
			expect(getHeaders).toHaveBeenNthCalledWith(1, authConfig);
			expect(getHeaders).toHaveBeenNthCalledWith(2, authConfig);
		});

		it("propagates empty-object headers from credential", () => {
			const credential = {
				getToken: vi.fn().mockReturnValue("t"),
				getHeaders: vi.fn().mockReturnValue({}),
				canRefresh: vi.fn().mockReturnValue(false),
				refresh: vi.fn(),
			} as unknown as AuthCredential;
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			});
			expect(handler.getHeaders()).toEqual({});
		});

		it("propagates multi-header maps from credential", () => {
			const credential = {
				getToken: vi.fn().mockReturnValue("t"),
				getHeaders: vi.fn().mockReturnValue({
					Authorization: "Bearer t",
					"X-Extra": "1",
				}),
				canRefresh: vi.fn().mockReturnValue(false),
				refresh: vi.fn(),
			} as unknown as AuthCredential;
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			});
			expect(handler.getHeaders()).toEqual({
				Authorization: "Bearer t",
				"X-Extra": "1",
			});
		});
	});

	describe("refreshToken leftovers", () => {
		it("is a no-op when credential is missing", async () => {
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
			});
			await expect(handler.refreshToken()).resolves.toBeUndefined();
		});

		it("is a no-op for ApiKeyCredential and BearerTokenCredential", async () => {
			for (const credential of [
				new ApiKeyCredential(PLACEHOLDER_KEY),
				new BearerTokenCredential(PLACEHOLDER_TOKEN),
				new BasicAuthCredential("u", "p"),
			]) {
				const refresh = vi.spyOn(credential, "refresh");
				const handler = new AuthHandler({
					authConfig: new AuthConfig({
						authScheme: new HttpScheme({ scheme: "bearer" }),
					}),
					credential,
				});
				await handler.refreshToken();
				expect(refresh).not.toHaveBeenCalled();
			}
		});

		it("refreshes OAuth2Credential when refreshFunction and refreshToken exist", async () => {
			const credential = new OAuth2Credential({
				accessToken: "old-placeholder",
				refreshToken: "refresh-placeholder",
				expiresIn: 60,
				refreshFunction: async () => ({
					accessToken: "new-placeholder",
					refreshToken: "refresh-placeholder-2",
					expiresIn: 120,
				}),
			});
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			});
			await handler.refreshToken();
			expect(handler.getToken()).toBe("new-placeholder");
			expect(handler.getHeaders()).toEqual({
				Authorization: "Bearer new-placeholder",
			});
			expect(credential.refreshToken).toBe("refresh-placeholder-2");
		});

		it("does not refresh OAuth2Credential without refreshFunction", async () => {
			const credential = new OAuth2Credential({
				accessToken: "static-placeholder",
				refreshToken: "unused-refresh",
			});
			const refresh = vi.spyOn(credential, "refresh");
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			});
			await handler.refreshToken();
			expect(refresh).not.toHaveBeenCalled();
			expect(handler.getToken()).toBe("static-placeholder");
		});

		it("surfaces refresh rejection from credential.refresh", async () => {
			const credential = {
				getToken: vi.fn(),
				getHeaders: vi.fn(),
				canRefresh: vi.fn().mockReturnValue(true),
				refresh: vi.fn().mockRejectedValue(new Error("refresh failed")),
			} as unknown as AuthCredential;
			const handler = new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			});
			await expect(handler.refreshToken()).rejects.toThrow("refresh failed");
		});

		it("does not call refresh when canRefresh is false", async () => {
			const refresh = vi.fn();
			const credential = {
				getToken: vi.fn(),
				getHeaders: vi.fn(),
				canRefresh: vi.fn().mockReturnValue(false),
				refresh,
			} as unknown as AuthCredential;
			await new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: new HttpScheme({ scheme: "bearer" }),
				}),
				credential,
			}).refreshToken();
			expect(refresh).not.toHaveBeenCalled();
		});
	});
});
