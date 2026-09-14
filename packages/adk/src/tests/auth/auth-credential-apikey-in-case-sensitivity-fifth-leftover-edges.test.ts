import { describe, expect, it } from "vitest";
import { AuthConfig } from "../../auth/auth-config";
import { ApiKeyCredential } from "../../auth/auth-credential";

describe("ApiKeyCredential scheme.in case sensitivity fifth leftover", () => {
	const credential = new ApiKeyCredential("k-secret");

	it("exact lowercase header emits named header", () => {
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: { in: "header", name: "X-Api-Key" } as any,
				}),
			),
		).toEqual({ "X-Api-Key": "k-secret" });
	});

	it.each([
		{ label: "Header", value: "Header" },
		{ label: "HEADER", value: "HEADER" },
		{ label: "hEaDeR", value: "hEaDeR" },
		{ label: " header", value: " header" },
		{ label: "header ", value: "header " },
		{ label: "query", value: "query" },
		{ label: "cookie", value: "cookie" },
		{ label: "empty-string", value: "" },
	])('$label scheme.in does not match strict === "header" → {}', ({
		value,
	}) => {
		expect(
			credential.getHeaders(
				new AuthConfig({
					authScheme: { in: value, name: "X-Api-Key" } as any,
				}),
			),
		).toEqual({});
	});
});
