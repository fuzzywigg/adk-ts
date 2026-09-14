import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../agents/invocation-context";
import { AuthConfig } from "../../auth/auth-config";
import { AuthHandler } from "../../auth/auth-handler";
import { requestProcessor } from "../../auth/auth-preprocessor";

function baseCtx(state: Record<string, unknown> = {}): InvocationContext {
	return {
		agent: { name: "auth-agent", canonicalTools: async () => [] },
		session: { events: [], state },
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

describe("auth-preprocessor temp: startsWith case leftover (post #168)", () => {
	it.each([
		{ label: "Temp:", key: "Temp:cred", stored: "temp:Temp:cred" },
		{ label: "TEMP:", key: "TEMP:cred", stored: "temp:TEMP:cred" },
		{ label: "TeMp:", key: "TeMp:cred", stored: "temp:TeMp:cred" },
		{
			label: "temp uppercase T only",
			key: "Tempcred",
			stored: "temp:Tempcred",
		},
	])('$label fails startsWith("temp:") and gets re-prefixed', ({
		key,
		stored,
	}) => {
		const state: Record<string, unknown> = {};
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey" } as any,
					context: { credentialKey: key },
				}),
				credential: { apiKey: "k" } as any,
			}),
			baseCtx(state),
		);
		expect(state[stored]).toEqual({ apiKey: "k" });
		expect(state[key]).toBeUndefined();
	});

	it("exact temp: prefix is kept without double-prefix", () => {
		const state: Record<string, unknown> = {};
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey" } as any,
					context: { credentialKey: "temp:already" },
				}),
				credential: { apiKey: "kept" } as any,
			}),
			baseCtx(state),
		);
		expect(state["temp:already"]).toEqual({ apiKey: "kept" });
		expect(Object.keys(state)).toEqual(["temp:already"]);
	});

	it("whitespace-only credentialKey is truthy and still re-prefixed", () => {
		const state: Record<string, unknown> = {};
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey" } as any,
					context: { credentialKey: "   " },
				}),
				credential: { apiKey: "ws" } as any,
			}),
			baseCtx(state),
		);
		expect(state["temp:   "]).toEqual({ apiKey: "ws" });
	});

	it("nullish credentialKey falls through || to temp:timestamp", () => {
		vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
		const state: Record<string, unknown> = {};
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey" } as any,
					context: { credentialKey: undefined },
				}),
				credential: { apiKey: "gen" } as any,
			}),
			baseCtx(state),
		);
		expect(state["temp:1700000000000"]).toEqual({ apiKey: "gen" });
		vi.restoreAllMocks();
	});
});
