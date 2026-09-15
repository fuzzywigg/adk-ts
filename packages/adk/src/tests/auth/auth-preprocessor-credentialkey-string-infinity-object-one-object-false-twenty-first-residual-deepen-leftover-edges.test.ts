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
 * Twenty-first leftover residual deepen (complements #287 Infinity/-1 throw):
 * string `"Infinity"` passes `||` and `startsWith` → stores under
 * `temp:Infinity` (no throw). `Object(1)` / `Object(false)` pass `||` but
 * fail `startsWith` → same catch/warn path as number Infinity.
 */
describe("auth-preprocessor credentialKey string-infinity/object-one/object-false twenty-first residual deepen", () => {
	it('string "Infinity" stores under temp:Infinity (no startsWith throw)', () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "Infinity" } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:Infinity"]);
		expect(state["temp:Infinity"]).toEqual({ apiKey: "secret" });
	});

	it("Object(1) fails startsWith → catch, state unchanged", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const boxed = Object(1);
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: boxed } as any,
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

	it("Object(false) fails startsWith → catch, state unchanged", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const boxed = Object(false);
		expect(Boolean(boxed)).toBe(true);
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: boxed } as any,
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

	it("number Infinity still fails startsWith (twentieth control)", () => {
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
});
