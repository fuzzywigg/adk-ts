import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import {
	ApiKeyCredential,
	AuthCredential,
	AuthCredentialType,
} from "../../auth/auth-credential";
import { AuthHandler } from "../../auth/auth-handler";
import { ApiKeyScheme } from "../../auth/auth-schemes";

function makeConfig(): AuthConfig {
	return new AuthConfig({
		authScheme: new ApiKeyScheme({
			in: "header",
			name: "X-Fake-API-Key",
			description: "Fake API key scheme for tests",
		}),
	});
}

class RefreshableCredential extends AuthCredential {
	refreshed = false;

	constructor(private readonly token: string) {
		super(AuthCredentialType.CUSTOM);
	}

	getToken(): string {
		return this.token;
	}

	getHeaders(): Record<string, string> {
		return { Authorization: `Custom ${this.token}` };
	}

	canRefresh(): boolean {
		return true;
	}

	async refresh(): Promise<void> {
		this.refreshed = true;
	}
}

describe("AuthHandler", () => {
	it("stores authConfig and optional credential", () => {
		const authConfig = makeConfig();
		const credential = new ApiKeyCredential("secret-key");
		const handler = new AuthHandler({ authConfig, credential });

		expect(handler.authConfig).toBe(authConfig);
		expect(handler.credential).toBe(credential);
	});

	it("getToken returns undefined without a credential", () => {
		const handler = new AuthHandler({ authConfig: makeConfig() });
		expect(handler.getToken()).toBeUndefined();
	});

	it("getToken returns the credential token", () => {
		const handler = new AuthHandler({
			authConfig: makeConfig(),
			credential: new ApiKeyCredential("secret-key"),
		});
		expect(handler.getToken()).toBe("secret-key");
	});

	it("getHeaders returns empty object without a credential", () => {
		const handler = new AuthHandler({ authConfig: makeConfig() });
		expect(handler.getHeaders()).toEqual({});
	});

	it("getHeaders delegates to the credential with authConfig", () => {
		const authConfig = makeConfig();
		const handler = new AuthHandler({
			authConfig,
			credential: new ApiKeyCredential("secret-key"),
		});
		expect(handler.getHeaders()).toEqual({ "X-Fake-API-Key": "secret-key" });
	});

	it("refreshToken is a no-op when credential cannot refresh", async () => {
		const credential = new ApiKeyCredential("secret-key");
		const refreshSpy = vi.spyOn(credential, "refresh");
		const handler = new AuthHandler({
			authConfig: makeConfig(),
			credential,
		});

		await handler.refreshToken();
		expect(refreshSpy).not.toHaveBeenCalled();
	});

	it("refreshToken refreshes when credential canRefresh is true", async () => {
		const credential = new RefreshableCredential("tok");
		const handler = new AuthHandler({
			authConfig: makeConfig(),
			credential,
		});

		await handler.refreshToken();
		expect(credential.refreshed).toBe(true);
	});

	it("refreshToken is a no-op without a credential", async () => {
		const handler = new AuthHandler({ authConfig: makeConfig() });
		await expect(handler.refreshToken()).resolves.toBeUndefined();
	});
});
