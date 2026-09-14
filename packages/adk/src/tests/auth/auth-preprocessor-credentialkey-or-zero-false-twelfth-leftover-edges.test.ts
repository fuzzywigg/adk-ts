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
 * Twelfth leftover: `context?.credentialKey || \`temp:${Date.now()}\``.
 * Fifth/seventh leftovers pin startsWith("temp:") case and empty/nullish.
 * Numeric 0 / false / NaN also take the timestamp arm; `"0"` becomes `temp:0`.
 */
describe("auth-preprocessor credentialKey || 0/false twelfth leftover", () => {
	it.each([
		{ label: "0", credentialKey: 0 },
		{ label: "false", credentialKey: false },
		{ label: "NaN", credentialKey: Number.NaN },
	])("falsy $label credentialKey stores under temp:<epoch>", ({
		credentialKey,
	}) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey } as any,
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:1717200000000"]);
		vi.useRealTimers();
	});

	it('truthy "0" prefixes as temp:0 without timestamp fallback', () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "0" },
			}),
			credential: { apiKey: "secret" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(Object.keys(state)).toEqual(["temp:0"]);
	});

	it("existing temp: prefix is still preserved (control)", () => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: "temp:already" },
			}),
			credential: { token: "abc" } as any,
		});
		callStore(authHandler, baseCtx(state));
		expect(state["temp:already"]).toEqual({ token: "abc" });
	});
});
