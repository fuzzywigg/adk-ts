import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eleventh leftover: OAuth2Credential ctor `if (config.expiresIn)` truthiness —
 * #178 tenth leftover covers refresh-result side; deepen covers expiresIn:0.
 * Empty string / false / null as ctor expiresIn are not tip-burned as leftover.
 */
describe("oauth2 ctor expiresIn falsy truthiness eleventh leftover edges", () => {
	it.each([
		{ label: "empty string", expiresIn: "" as any },
		{ label: "false", expiresIn: false as any },
		{ label: "null", expiresIn: null as any },
		{ label: "undefined", expiresIn: undefined },
		{ label: "NaN", expiresIn: Number.NaN as any },
		{ label: "0", expiresIn: 0 },
	])("leaves expiresAt unset when ctor expiresIn is falsy ($label)", ({
		expiresIn,
	}) => {
		const credential = new OAuth2Credential({
			accessToken: "access",
			expiresIn,
		});
		expect(credential.expiresAt).toBeUndefined();
		expect(credential.isExpired()).toBe(false);
	});

	it("sets expiresAt when ctor expiresIn is truthy (control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			expiresIn: 90,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() + 90 * 1000,
		);
		vi.useRealTimers();
	});

	it('whitespace string " " is truthy; Number(" ") is 0 so expiresAt ≈ now', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "access",
			expiresIn: " " as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});
});
