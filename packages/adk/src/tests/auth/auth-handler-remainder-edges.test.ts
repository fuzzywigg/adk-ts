import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
import { AuthHandler } from "../../auth/auth-handler";
import { ApiKeyScheme, HttpScheme } from "../../auth/auth-schemes";

describe("auth handler remainder edges (TOKENMAXX after #153)", () => {
	it("getHeaders with live ApiKeyCredential header scheme", () => {
		const authConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "X-Key" }),
		});
		const handler = new AuthHandler({
			authConfig,
			credential: new ApiKeyCredential("secret"),
		});
		expect(handler.getHeaders()).toEqual({ "X-Key": "secret" });
		expect(handler.getToken()).toBe("secret");
	});

	it("getHeaders with Basic and Bearer credentials", () => {
		const basic = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "basic" }),
			}),
			credential: new BasicAuthCredential("alice", "wonder"),
		});
		expect(basic.getHeaders().Authorization).toMatch(/^Basic /);
		expect(basic.getToken()).toBe(
			Buffer.from("alice:wonder").toString("base64"),
		);

		const bearer = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			}),
			credential: new BearerTokenCredential("tok-1"),
		});
		expect(bearer.getHeaders()).toEqual({ Authorization: "Bearer tok-1" });
		expect(bearer.getToken()).toBe("tok-1");
	});

	it("refreshToken updates underlying OAuth2Credential access token", async () => {
		const credential = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "r",
			refreshFunction: async () => ({ accessToken: "fresh" }),
		});
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			}),
			credential,
		});
		await handler.refreshToken();
		expect(handler.getToken()).toBe("fresh");
	});

	it("refreshToken is no-op when canRefresh is false", async () => {
		const refresh = vi.fn(async () => ({ accessToken: "nope" }));
		const credential = new OAuth2Credential({
			accessToken: "old",
			refreshFunction: refresh,
		});
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new HttpScheme({ scheme: "bearer" }),
			}),
			credential,
		});
		expect(credential.canRefresh()).toBe(false);
		await handler.refreshToken();
		expect(refresh).not.toHaveBeenCalled();
		expect(handler.getToken()).toBe("old");
	});

	it("missing credential yields empty headers and undefined token", async () => {
		const handler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: new ApiKeyScheme({ in: "header", name: "X-Key" }),
			}),
		});
		expect(handler.getHeaders()).toEqual({});
		expect(handler.getToken()).toBeUndefined();
		await expect(handler.refreshToken()).resolves.toBeUndefined();
	});

	it("stores the same authConfig reference from constructor", () => {
		const authConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "header", name: "X-Key" }),
		});
		const handler = new AuthHandler({ authConfig });
		expect(handler.authConfig).toBe(authConfig);
	});
});
