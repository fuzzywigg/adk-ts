import { describe, expect, it } from "vitest";
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

describe("auth-preprocessor temp: prefix case-sensitivity seventh leftover (post #160)", () => {
	it.each([
		{ key: "TEMP:already", stored: "temp:TEMP:already" },
		{ key: "Temp:x", stored: "temp:Temp:x" },
		{ key: "temp:OK", stored: "temp:OK" },
		{ key: " temporary", stored: "temp: temporary" },
		{ key: "temp", stored: "temp:temp" },
		{ key: "temp:", stored: "temp:" },
	])('startsWith("temp:") is case-sensitive for credentialKey=$key → $stored', ({
		key,
		stored,
	}) => {
		const state: Record<string, unknown> = {};
		const authHandler = new AuthHandler({
			authConfig: new AuthConfig({
				authScheme: { type: "apiKey" } as any,
				context: { credentialKey: key },
			}),
			credential: { apiKey: "secret" } as any,
		});

		callStore(authHandler, baseCtx(state));

		expect(Object.keys(state)).toEqual([stored]);
		expect(state[stored]).toEqual({ apiKey: "secret" });
	});

	it("lowercase temp: prefix is preserved without double-prefix (control)", () => {
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
		expect(state["temp:temp:already"]).toBeUndefined();
	});
});
