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
 * Twentieth leftover (HEAVY tip-relaunch residual after #258):
 * `context?.credentialKey || \`temp:${Date.now()}\`` then startsWith —
 * sixteenth pins string `"false"` → `temp:false`. String `"true"` is likewise
 * truthy and prefixes as `temp:true` (distinct from boolean-true throw and
 * from nineteenth `[]`/`{}` startsWith throw).
 */
describe("auth-preprocessor credentialKey string-true temp-prefix twentieth leftover", () => {
	it('truthy "true" prefixes as temp:true without timestamp fallback', () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "true" },
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:true"]);
		expect(state["temp:true"]).toEqual({ apiKey: "secret" });
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
});
