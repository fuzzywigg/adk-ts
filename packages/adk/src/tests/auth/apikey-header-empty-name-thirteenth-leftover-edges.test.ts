import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyCredential } from "../../auth/auth-credential";

/**
 * Thirteenth leftover: ApiKeyCredential getHeaders uses `{ [scheme.name]: key }`
 * with no empty-name guard when `in === "header"`. Empty / whitespace / "0"
 * names still emit a header entry.
 */
describe("ApiKeyCredential header empty-name thirteenth leftover", () => {
	const credential = new ApiKeyCredential("secret-key");

	it.each([
		{ label: "empty", name: "" },
		{ label: "space", name: " " },
		{ label: "string 0", name: "0" },
		{ label: "false string", name: "false" },
	])("header name=$label still emits keyed header", ({ name }) => {
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: { in: "header", name } as any,
				}),
			),
		).toEqual({ [name]: "secret-key" });
	});

	it("query placement still returns {} regardless of name (control)", () => {
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: { in: "query", name: "" } as any,
				}),
			),
		).toEqual({});
	});
});
