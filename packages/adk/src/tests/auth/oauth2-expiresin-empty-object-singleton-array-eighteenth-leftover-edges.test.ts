import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover: non-numeric truthy `expiresIn` beyond seventeenth
 * `[]` / `NEGATIVE_INFINITY`. Empty object `{}` → `ToNumber` NaN → Invalid
 * Date; singleton `[1]` / string `"1"` → 1000ms; `[0]` → 0 like `[]`.
 */
describe("oauth2 expiresIn empty-object / singleton-array eighteenth leftover", () => {
	it("ctor expiresIn {} → Invalid Date → isExpired false", () => {
		expect(({} as any) * 1000).toBeNaN();
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: {} as any,
		});
		expect(credential.expiresAt).toBeInstanceOf(Date);
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("ctor expiresIn [1] → now + 1000ms", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect(([1] as any) * 1000).toBe(1000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [1] as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it('ctor expiresIn "1" → now + 1000ms', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: "1" as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("ctor expiresIn [0] → expiresAt ≈ now → isExpired true", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect(([0] as any) * 1000).toBe(0);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [0] as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("refresh expiresIn {} → Invalid Date", async () => {
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: {},
				}) as any,
		});
		await credential.refresh();
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});

	it("empty array still → now (seventeenth control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [] as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		vi.useRealTimers();
	});
});
