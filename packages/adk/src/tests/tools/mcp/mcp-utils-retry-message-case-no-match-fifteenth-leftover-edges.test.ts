import { afterEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "../../../tools/mcp/utils";

/**
 * Fifteenth leftover: closed-resource match is case-sensitive includes().
 * "Closed" / "Econnreset" / "SOCKET HANG UP" do not retry.
 */
describe("mcp utils retry message case no-match fifteenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		"Closed",
		"Econnreset",
		"SOCKET HANG UP",
		"Socket Hang Up",
	] as const)("does not retry on case-mismatched %j", async (message) => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error(message);
		});
		const wrapped = withRetry(fn, {}, reinit, 2);
		await expect(wrapped()).rejects.toThrow(message);
		expect(reinit).not.toHaveBeenCalled();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("lowercase closed still retries (control)", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const reinit = vi.fn(async () => undefined);
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("connection closed"))
			.mockResolvedValueOnce("ok");
		const wrapped = withRetry(fn, {}, reinit, 1);
		await expect(wrapped()).resolves.toBe("ok");
		expect(reinit).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
