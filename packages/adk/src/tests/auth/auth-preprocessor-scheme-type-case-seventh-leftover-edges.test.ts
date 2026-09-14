import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { AuthConfig } from "../../auth/auth-config";
import { AuthHandler } from "../../auth/auth-handler";
import { requestProcessor } from "../../auth/auth-preprocessor";

function baseCtx(state: Record<string, unknown>): InvocationContext {
	return {
		agent: {
			name: "auth-agent",
			canonicalTools: async () => [],
		},
		session: {
			events: [],
			state,
		},
		runConfig: {},
	} as unknown as InvocationContext;
}

function callStore(
	authHandler: AuthHandler,
	invocationContext: InvocationContext,
): void {
	(requestProcessor as any).parseAndStoreAuthResponse(
		authHandler,
		invocationContext,
	);
}

describe("auth-preprocessor scheme type case-sensitivity seventh leftover (post #160)", () => {
	it.each([
		"OAuth2",
		"OAUTH2",
		"Oauth2",
		"openIDConnect",
		"OpenIdConnect",
		"OPENIDCONNECT",
	])("scheme type %j misses oauth2/openIdConnect branch but still stores", (type) => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type } as any,
				context: { credentialKey: "temp:cased" },
			}),
			credential: { accessToken: "tok" } as any,
		});

		expect(() => callStore(authHandler, baseCtx(state))).not.toThrow();
		expect(state["temp:cased"]).toEqual({ accessToken: "tok" });
	});

	it.each([
		"oauth2",
		"openIdConnect",
	] as const)("exact lowercase %j still stores (control)", (type) => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type } as any,
				context: { credentialKey: `temp:${type}` },
			}),
			credential: { accessToken: "tok" } as any,
		});

		expect(() => callStore(authHandler, baseCtx(state))).not.toThrow();
		expect(state[`temp:${type}`]).toEqual({ accessToken: "tok" });
	});

	it("cased oauth type store failure still warns via outer catch", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const state: Record<string, unknown> = {};
		Object.defineProperty(state, "temp:boom", {
			configurable: true,
			enumerable: true,
			get() {
				return undefined;
			},
			set() {
				throw new Error("state write failed");
			},
		});
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "OAuth2" } as any,
				context: { credentialKey: "temp:boom" },
			}),
			credential: { accessToken: "x" } as any,
		});

		expect(() => callStore(authHandler, baseCtx(state))).not.toThrow();
		expect(warn).toHaveBeenCalledWith(
			"Failed to store auth response:",
			expect.any(Error),
		);
		warn.mockRestore();
	});
});
