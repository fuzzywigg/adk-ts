import { describe, expect, it } from "vitest";
import {
	BasicAuthCredential,
	BearerTokenCredential,
} from "../../auth/auth-credential";

/**
 * Fourteenth leftover: Basic/Bearer getHeaders/getToken have no truthiness
 * gate — empty / whitespace / `"0"` / numeric-coerced values still emit
 * Authorization headers (asymmetry vs oauth2 refreshToken `if` gates).
 */
describe("basic-bearer empty-whitespace token emit fourteenth leftover", () => {
	it.each([
		{ label: "empty", token: "" },
		{ label: "space", token: " " },
		{ label: '"0"', token: "0" },
	])("Bearer $label token still emits Authorization", ({ token }) => {
		const credential = new BearerTokenCredential(token);
		expect(credential.getToken()).toBe(token);
		expect(credential.getHeaders()).toEqual({
			Authorization: `Bearer ${token}`,
		});
	});

	it("Basic empty username/password still base64-encodes", () => {
		const credential = new BasicAuthCredential("", "");
		expect(credential.getToken()).toBe(Buffer.from(":").toString("base64"));
		expect(credential.getHeaders()).toEqual({
			Authorization: `Basic ${Buffer.from(":").toString("base64")}`,
		});
	});

	it('Basic username "0" password " " encode literally', () => {
		const credential = new BasicAuthCredential("0", " ");
		const encoded = Buffer.from("0: ").toString("base64");
		expect(credential.getToken()).toBe(encoded);
		expect(credential.getHeaders().Authorization).toBe(`Basic ${encoded}`);
	});
});
