import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Twenty-first leftover residual deepen (complements #287 string `"Infinity"`
 * / `-0` / nineteenth `Number(0)`): `Object(1)` → now+1s; `Object(false)`
 * truthy enter with ToNumber 0 → now+0 (distinct Boolean-boxed peer of
 * `Number(0)`).
 */
describe("oauth2 expiresIn object-one/object-false twenty-first residual deepen", () => {
	it("ctor expiresIn Object(1) → now + 1s → isExpired true (30s buffer)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxed = Object(1);
		expect(Boolean(boxed)).toBe(true);
		expect((boxed as any) * 1000).toBe(1000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: boxed as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("ctor expiresIn Object(false) → now + 0 → isExpired true", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxed = Object(false);
		expect(Boolean(boxed)).toBe(true);
		expect((boxed as any) * 1000).toBe(0);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: boxed as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("refresh expiresIn Object(1) → now + 1s", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxed = Object(1);
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: boxed,
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("refresh expiresIn Object(false) → now + 0", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxed = Object(false);
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: boxed,
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("boxed Number(0) still enters (nineteenth control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const boxedZero = new Number(0) as any;
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: boxedZero,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it('string "Infinity" still → Invalid Date (twentieth control)', () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "Infinity" as any,
		});
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});
});
