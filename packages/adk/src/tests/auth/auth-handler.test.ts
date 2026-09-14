import { describe, expect, it, vi } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import type { AuthCredential } from "../../auth/auth-credential";
import { BearerTokenCredential } from "../../auth/auth-credential";
import { AuthHandler } from "../../auth/auth-handler";
import { HttpScheme } from "../../auth/auth-schemes";

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

	it("stores injected authConfig and credential on the instance", () => {
		const credential = {
			getToken: vi.fn().mockReturnValue("t"),
			getHeaders: vi.fn().mockReturnValue({}),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as unknown as AuthCredential;
		const handler = new AuthHandler({ authConfig, credential });
		expect(handler.authConfig).toBe(authConfig);
		expect(handler.credential).toBe(credential);
	});

	it("propagates refresh() rejection from the credential", async () => {
		const credential = {
			getToken: vi.fn(),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(true),
			refresh: vi.fn().mockRejectedValue(new Error("refresh failed")),
		} as unknown as AuthCredential;

		await expect(
			new AuthHandler({ authConfig, credential }).refreshToken(),
		).rejects.toThrow(/refresh failed/);
	});

	it("integrates with a real BearerTokenCredential", () => {
		const credential = new BearerTokenCredential("live-token");
		const handler = new AuthHandler({ authConfig, credential });
		expect(handler.getToken()).toBe("live-token");
		expect(handler.getHeaders()).toEqual({
			Authorization: "Bearer live-token",
		});
	});

	it("returns undefined when credential getToken yields undefined", () => {
		const credential = {
			getToken: vi.fn().mockReturnValue(undefined),
			getHeaders: vi.fn(),
			canRefresh: vi.fn().mockReturnValue(false),
			refresh: vi.fn(),
		} as unknown as AuthCredential;
		expect(
			new AuthHandler({ authConfig, credential }).getToken(),
		).toBeUndefined();
	});
});
