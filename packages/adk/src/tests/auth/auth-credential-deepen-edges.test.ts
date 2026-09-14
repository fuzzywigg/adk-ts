import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	AuthCredential,
	AuthCredentialType,
	BasicAuthCredential,
	BearerTokenCredential,
	OAuth2Credential,
} from "../../auth/auth-credential";
import { ApiKeyScheme } from "../../auth/auth-schemes";

describe("auth credential deepen edges (TOKENMAXX after #153)", () => {
	it("BasicAuthCredential empty user/pass encodes colon-only Base64", () => {
		const credential = new BasicAuthCredential("", "");
		expect(credential.getToken()).toBe(Buffer.from(":").toString("base64"));
		expect(credential.getHeaders({} as any)).toEqual({
			Authorization: `Basic ${Buffer.from(":").toString("base64")}`,
		});
	});

	it("BearerTokenCredential empty token still emits Bearer prefix", () => {
		const credential = new BearerTokenCredential("");
		expect(credential.getToken()).toBe("");
		expect(credential.getHeaders({} as any)).toEqual({
			Authorization: "Bearer ",
		});
	});

	it("ApiKeyCredential returns {} when scheme.in is undefined", () => {
		const credential = new ApiKeyCredential("secret");
		const headers = credential.getHeaders(
			new AuthConfig({
				authScheme: { in: undefined, name: "X-Key" } as any,
			}),
		);
		expect(headers).toEqual({});
	});

	it("OAuth2Credential near-expiry isExpired true via 30s skew window", () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			expiresIn: 10,
		});
		expect(credential.isExpired()).toBe(true);
	});

	it("OAuth2Credential refresh with expiresIn 1 keeps skew-expired window", async () => {
		const credential = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () => ({
				accessToken: "new",
				expiresIn: 1,
			}),
		});
		expect(credential.isExpired()).toBe(false);
		await credential.refresh();
		expect(credential.getToken()).toBe("new");
		expect(credential.isExpired()).toBe(true);
	});

	it("OAuth2Credential expiresIn 0 is falsy so expiresAt stays unset", () => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			expiresIn: 0,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});

	it("OAuth2Credential refresh without new refreshToken keeps prior refreshToken", async () => {
		const credential = new OAuth2Credential({
			accessToken: "old",
			refreshToken: "keep-me",
			refreshFunction: async () => ({ accessToken: "next" }),
		});
		await credential.refresh();
		expect(credential.refreshToken).toBe("keep-me");
		expect(credential.getToken()).toBe("next");
	});

	it("custom AuthCredential subclass keeps canRefresh false and refresh throwing", async () => {
		class CustomCredential extends AuthCredential {
			constructor() {
				super(AuthCredentialType.CUSTOM);
			}
			getToken() {
				return "custom";
			}
			getHeaders() {
				return { "X-Custom": "custom" };
			}
		}
		const credential = new CustomCredential();
		expect(credential.canRefresh()).toBe(false);
		await expect(credential.refresh()).rejects.toThrow(/not supported/);
	});

	it("ApiKeyScheme header placement uses scheme.name as header key", () => {
		const credential = new ApiKeyCredential("k");
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: new ApiKeyScheme({ in: "header", name: "X-Api-Key" }),
				}),
			),
		).toEqual({ "X-Api-Key": "k" });
	});
});
