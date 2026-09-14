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

/**
 * Eighteenth leftover: `context?.credentialKey || \`temp:${Date.now()}\``
 * then `credentialKey.startsWith("temp:")`. Seventeenth pins boolean `true`
 * → startsWith TypeError. Number `1` likewise passes `||` but is not a
 * string → same catch/warn path, nothing stored.
 */
describe("auth-preprocessor credentialKey number-one startsWith-throw eighteenth leftover", () => {
	it("truthy number 1 fails startsWith → catch, state unchanged", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: 1 } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual([]);
		expect(warn).toHaveBeenCalledWith(
			"Failed to store auth response:",
			expect.any(TypeError),
		);
		warn.mockRestore();
	});

	it("boolean true still fails startsWith (seventeenth control)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: true } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it('string "1" still prefixes as temp:1 (string control)', () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "1" },
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:1"]);
	});

	it("numeric 0 still takes epoch arm (falsy control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: 0 } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:1717200000000"]);
		vi.useRealTimers();
	});
});
