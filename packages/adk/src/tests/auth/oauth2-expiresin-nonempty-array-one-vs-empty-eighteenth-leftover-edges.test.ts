import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Eighteenth leftover: `if (config.expiresIn)` / `if (result.expiresIn)` —
 * seventeenth pins empty `[]` → `[] * 1000` = 0 → expiresAt ≈ now. Non-empty
 * `[1]` is likewise truthy but `[1] * 1000` → 1000 → expiresAt = now + 1s;
 * isExpired still true because of the 30s skew buffer. `[60]` clears the
 * buffer → isExpired false.
 */
describe("oauth2 expiresIn nonempty-array-one vs empty eighteenth leftover", () => {
	it("ctor expiresIn [1] → now + 1000ms → isExpired true (30s buffer)", () => {
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
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("ctor expiresIn [60] → now + 60s → isExpired false", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		expect(([60] as any) * 1000).toBe(60000);
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [60] as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:01:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it("ctor expiresIn [] still → now → isExpired true (seventeenth control)", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [] as any,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime(),
		);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("refresh expiresIn [1] → now + 1000ms", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			refreshToken: "r",
			expiresIn: 3600,
			refreshFunction: async () =>
				({
					accessToken: "n",
					expiresIn: [1],
				}) as any,
		});
		await credential.refresh();
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:01.000Z").getTime(),
		);
		vi.useRealTimers();
	});

	it("multi-element [1,2] → NaN Invalid Date (asymmetry vs [1])", () => {
		expect(([1, 2] as any) * 1000).toBeNaN();
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: [1, 2] as any,
		});
		expect(Number.isNaN(credential.expiresAt!.getTime())).toBe(true);
		expect(credential.isExpired()).toBe(false);
	});
});
