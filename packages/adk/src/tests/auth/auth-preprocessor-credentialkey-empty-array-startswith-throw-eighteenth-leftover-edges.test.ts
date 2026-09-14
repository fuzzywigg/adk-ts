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
 * → TypeError. Empty array `[]` / `{}` likewise pass `||` then throw on
 * `.startsWith` → catch warn, nothing stored.
 */
describe("auth-preprocessor credentialKey empty-array startsWith-throw eighteenth leftover", () => {
	it.each([
		{ label: "[]", credentialKey: [] },
		{ label: "{}", credentialKey: {} },
	])("truthy $label fails startsWith → catch, state unchanged", ({
		credentialKey,
	}) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey } as any,
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

	it('string "false" still prefixes as temp:false (sixteenth control)', () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "false" },
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:false"]);
	});
});
