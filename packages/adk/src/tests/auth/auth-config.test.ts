import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { HttpScheme, OAuth2Scheme } from "../../auth/auth-schemes";

describe("AuthConfig", () => {
	it("wraps an auth scheme with optional context", () => {
		const authScheme = new HttpScheme({
			scheme: "bearer",
			bearerFormat: "JWT",
		});
		const config = new AuthConfig({
			authScheme,
			context: { realm: "api" },
		});

		expect(config.authScheme).toBe(authScheme);
		expect(config.context?.realm).toBe("api");
	});

	it("works with OAuth2 schemes", () => {
		const authScheme = new OAuth2Scheme({
			flows: {
				clientCredentials: {
					tokenUrl: "https://example.com/token",
					scopes: { write: "Write" },
				},
			},
		});
		const config = new AuthConfig({ authScheme });
		expect(config.authScheme.type).toBe("oauth2");
		expect(config.context).toBeUndefined();
	});
});
