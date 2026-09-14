import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyCredential } from "../../auth/auth-credential";

/**
 * Thirteenth leftover: getHeaders uses strict `scheme.in === "header"`.
 * Fifth leftover covers case/empty-string/undefined→{}. Missing falsy
 * non-string `in` values that are not undefined.
 */
describe("ApiKeyCredential scheme.in falsy non-undefined thirteenth leftover", () => {
	const credential = new ApiKeyCredential("k-secret");

	it.each([
		{ label: "null", value: null },
		{ label: "false", value: false },
		{ label: "0", value: 0 },
		{ label: "NaN", value: Number.NaN },
	])("$label scheme.in does not match header → {}", ({ value }) => {
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: { in: value as any, name: "X-Api-Key" } as any,
				}),
			),
		).toEqual({});
	});

	it("exact header still emits named header (control)", () => {
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: { in: "header", name: "X-Api-Key" } as any,
				}),
			),
		).toEqual({ "X-Api-Key": "k-secret" });
	});
});
