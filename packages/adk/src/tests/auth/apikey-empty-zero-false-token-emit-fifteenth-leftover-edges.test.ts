import { describe, expect, it } from "vitest";
import { ApiKeyCredential } from "../../auth/auth-credential";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyScheme } from "../../auth/auth-schemes";

/**
 * Fifteenth leftover: ApiKeyCredential getToken/getHeaders have no
 * truthiness gate on the key when `in === "header"` — empty / `"0"` /
 * `"false"` / whitespace still emit. Thirteenth pins empty *name*;
 * basic-bearer fourteenth pins Bearer/Basic emit parity.
 */
describe("apikey empty-zero-false token emit fifteenth leftover", () => {
	const headerConfig = new AuthConfig({
		authScheme: new ApiKeyScheme({ in: "header", name: "X-Api-Key" }),
	});

	it.each([
		{ label: "empty", apiKey: "" },
		{ label: '"0"', apiKey: "0" },
		{ label: '"false"', apiKey: "false" },
		{ label: "space", apiKey: " " },
	])("header in: $label key still emits named header", ({ apiKey }) => {
		const credential = new ApiKeyCredential(apiKey);
		expect(credential.getToken()).toBe(apiKey);
		expect(credential.getHeaders(headerConfig)).toEqual({
			"X-Api-Key": apiKey,
		});
	});

	it("query in still returns {} even for truthy key (control)", () => {
		const queryConfig = new AuthConfig({
			authScheme: new ApiKeyScheme({ in: "query", name: "key" }),
		});
		const credential = new ApiKeyCredential("0");
		expect(credential.getHeaders(queryConfig)).toEqual({});
	});
});
