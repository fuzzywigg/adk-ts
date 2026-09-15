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
 * Twentieth leftover residual deepen (complements #287 Infinity/-1
 * startsWith-throw): `Object(true)` likewise fails startsWith → catch;
 * string `"Infinity"` is a truthy string that does *not* start with
 * `temp:` → wrapped as `temp:Infinity` and stored (asymmetry vs number
 * Infinity throw). `NaN` remains falsy epoch arm (twelfth control).
 */
describe("auth-preprocessor credentialKey object-true/string-Infinity twentieth residual deepen", () => {
	it("truthy Object(true) fails startsWith → catch, state unchanged", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: Object(true) } as any,
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

	it('string "Infinity" wraps as temp:Infinity and stores', () => {
		const state: Record<string, unknown> = {};
		const credential = { apiKey: "secret" } as any;
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "Infinity" } as any,
			}),
			credential,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:Infinity"]);
		expect(state["temp:Infinity"]).toBe(credential);
	});

	it("Infinity number still fails startsWith (twentieth control)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: Number.POSITIVE_INFINITY } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual([]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});

	it("NaN still takes epoch arm (falsy control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: Number.NaN } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:1717200000000"]);
		vi.useRealTimers();
	});
});
