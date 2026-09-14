import { describe, expect, it, vi } from "vitest";
import { OAuth2Credential } from "../../auth/auth-credential";

/**
 * Fifteenth leftover: `expiresAt.getTime() - 30000 < Date.now()` —
 * leftover schemes pin ~10s near-expiry and 3600 far. Exact equality at
 * 30000ms remaining is NOT expired (`<` not `<=`); 29999ms is expired.
 */
describe("oauth2 isExpired exact-30s boundary fifteenth leftover", () => {
	it("exactly 30000ms remaining → isExpired false", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
		const credential = new OAuth2Credential({
			accessToken: "a",
			expiresIn: 30,
		});
		expect(credential.expiresAt?.getTime()).toBe(
			new Date("2024-06-01T00:00:00.000Z").getTime() + 30000,
		);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});

	it("29999ms remaining → isExpired true", () => {
		vi.useFakeTimers();
		const now = new Date("2024-06-01T00:00:00.000Z");
		vi.setSystemTime(now);
		const credential = new OAuth2Credential({ accessToken: "a" });
		credential.expiresAt = new Date(now.getTime() + 29999);
		expect(credential.isExpired()).toBe(true);
		vi.useRealTimers();
	});

	it("30001ms remaining → isExpired false (control above boundary)", () => {
		vi.useFakeTimers();
		const now = new Date("2024-06-01T00:00:00.000Z");
		vi.setSystemTime(now);
		const credential = new OAuth2Credential({ accessToken: "a" });
		credential.expiresAt = new Date(now.getTime() + 30001);
		expect(credential.isExpired()).toBe(false);
		vi.useRealTimers();
	});
});
