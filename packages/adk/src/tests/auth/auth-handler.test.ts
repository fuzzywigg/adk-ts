import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	type AuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
import { AuthHandler } from "../../auth/auth-handler";
import { ApiKeyScheme, HttpScheme } from "../../auth/auth-schemes";

describe("AuthHandler", () => {
	const authConfig = new AuthConfig({
		authScheme: new HttpScheme({ scheme: "bearer" }),
	});

	it("getToken returns undefined without a credential", () => {
		const handler = new AuthHandler({ authConfig });
		expect(handler.getToken()).toBeUndefined();
	});

	it("getToken returns the credential token when present", () => {
		const credential = {
			getToken: vi.fn().mockReturnValue("tok-123"),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as unknown as AuthCredential;

		const handler = new AuthHandler({ authConfig, credential });
		expect(handler.getToken()).toBe("tok-123");
		expect(credential.getToken).toHaveBeenCalled();
	});

	it("getHeaders returns {} without a credential", () => {
		const handler = new AuthHandler({ authConfig });
		expect(handler.getHeaders()).toEqual({});
	});

	it("getHeaders delegates to the credential when present", () => {
		const credential = {
			getToken: vi.fn(),
			getHeaders: vi.fn().mockReturnValue({ Authorization: "Bearer x" }),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as unknown as AuthCredential;

		const handler = new AuthHandler({ authConfig, credential });
		expect(handler.getHeaders()).toEqual({ Authorization: "Bearer x" });
		expect(credential.getHeaders).toHaveBeenCalledWith(authConfig);
	});

	it("refreshToken refreshes only when canRefresh() is true", async () => {
		const refreshable = {
			getToken: vi.fn(),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(true),
			refresh: vi.fn().mockResolvedValue(undefined),
		} as unknown as AuthCredential;

		await new AuthHandler({
			authConfig,
			credential: refreshable,
		}).refreshToken();
		expect(refreshable.canRefresh).toHaveBeenCalled();
		expect(refreshable.refresh).toHaveBeenCalled();

		const nonRefreshable = {
			getToken: vi.fn(),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as unknown as AuthCredential;

		await new AuthHandler({
			authConfig,
			credential: nonRefreshable,
		}).refreshToken();
		expect(nonRefreshable.canRefresh).toHaveBeenCalled();
		expect(nonRefreshable.refresh).not.toHaveBeenCalled();
	});

	it("refreshToken is a no-op without a credential", async () => {
		const handler = new AuthHandler({ authConfig });
		await expect(handler.refreshToken()).resolves.toBeUndefined();
	});
});

describe("AuthHandler real credential integration", () => {
	it("getHeaders and getToken work with ApiKeyCredential + header scheme", () => {
		const credential = new ApiKeyCredential("live-key");
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "X-API-Key" }),
			}),
			credential,
		});

		expect(handler.getToken()).toBe("live-key");
		expect(handler.getHeaders()).toEqual({ "X-API-Key": "live-key" });
	});

	it("getHeaders returns empty for ApiKeyCredential query scheme", () => {
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new ApiKeyScheme({ in: "query", name: "api_key" }),
			}),
			credential: new ApiKeyCredential("q-key"),
		});
		expect(handler.getHeaders()).toEqual({});
		expect(handler.getToken()).toBe("q-key");
	});

	it("refreshToken mutates a real OAuth2Credential", async () => {
		const credential = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "r",
			expiresIn: 60,
			refreshFunction: async () => ({
				accessToken: "new",
				refreshToken: "r2",
				expiresIn: 3600,
			}),
		});
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			}),
			credential,
		});

		await handler.refreshToken();
		expect(handler.getToken()).toBe("new");
		expect(handler.getHeaders()).toEqual({
			Authorization: "Bearer new",
		});
		expect(credential.refreshToken).toBe("r2");
	});

	it("refreshToken surfaces rejection from OAuth2Credential.refresh", async () => {
		const credential = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "r",
			refreshFunction: async () => {
				throw new Error("refresh rejected");
			},
		});
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			}),
			credential,
		});

		await expect(handler.refreshToken()).rejects.toThrow(/refresh rejected/);
	});

	it("getHeaders works with BearerTokenCredential", () => {
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer", bearerFormat: "JWT" }),
			}),
			credential: new BearerTokenCredential("jwt-token"),
		});
		expect(handler.getToken()).toBe("jwt-token");
		expect(handler.getHeaders()).toEqual({
			Authorization: "Bearer jwt-token",
		});
	});
});
