import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyCredential } from "../../auth/auth-credential";
import { AuthHandler } from "../../auth/auth-handler";
import { requestProcessor } from "../../auth/auth-preprocessor";
import type { InvocationContext } from "../../agents/invocation-context";

function callStore(
	authHandler: AuthHandler,
	invocationContext: InvocationContext,
): void {
	(requestProcessor as any).parseAndStoreAuthResponse(
		authHandler,
		invocationContext,
	);
}

describe("auth-preprocessor temp: prefix case sensitivity fifth leftover", () => {
	it.each([
		{ label: "Temp:", key: "Temp:cred", stored: "temp:Temp:cred" },
		{ label: "TEMP:", key: "TEMP:cred", stored: "temp:TEMP:cred" },
		{ label: "temp: already", key: "temp:cred", stored: "temp:cred" },
		{ label: "plain", key: "plain-key", stored: "temp:plain-key" },
		{ label: "temp (no colon)", key: "temp", stored: "temp:temp" },
	])('$label credentialKey startsWith("temp:") is case-sensitive', ({
		key,
		stored,
	}) => {
		const state: Record<string, unknown> = {};
		const ctx = { session: { state } } as unknown as InvocationContext;
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey", in: "header", name: "X" } as any,
					context: { credentialKey: key },
				}),
				credential: new ApiKeyCredential("secret"),
			}),
			ctx,
		);
		expect(Object.keys(state)).toEqual([stored]);
		expect(state[stored]).toBeInstanceOf(ApiKeyCredential);
	});

	it("falsy credentialKey falls back to temp:timestamp via ||", () => {
		const state: Record<string, unknown> = {};
		const ctx = { session: { state } } as unknown as InvocationContext;
		callStore(
			new AuthHandler({
				authConfig: new AuthConfig({
					authScheme: { type: "apiKey", in: "header", name: "X" } as any,
					context: { credentialKey: "" },
				}),
				credential: new ApiKeyCredential("secret"),
			}),
			ctx,
		);
		const keys = Object.keys(state);
		expect(keys).toHaveLength(1);
		expect(keys[0].startsWith("temp:")).toBe(true);
		expect(keys[0]).not.toBe("temp:");
	});
});
