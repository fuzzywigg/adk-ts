import { afterEach, describe, expect, it, vi } from "vitest";
import { retryOnClosedResource, withRetry } from "../../../tools/mcp/utils";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("withRetry", () => {
	it("returns on the first successful attempt", async () => {
		const instance = {};
		const fn = vi.fn().mockResolvedValue("ok");
		const reinit = vi.fn();

		const wrapped = withRetry(fn, instance, reinit);
		await expect(wrapped()).resolves.toBe("ok");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("retries on closed / ECONNRESET errors then succeeds", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const instance = {};
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("connection closed"))
			.mockRejectedValueOnce(new Error("ECONNRESET"))
			.mockResolvedValue("recovered");
		const reinit = vi.fn().mockResolvedValue(undefined);

		const wrapped = withRetry(fn, instance, reinit, 2);
		await expect(wrapped()).resolves.toBe("recovered");
		expect(fn).toHaveBeenCalledTimes(3);
		expect(reinit).toHaveBeenCalledTimes(2);
	});

	it("rethrows non-retryable errors immediately", async () => {
		const instance = {};
		const fn = vi.fn().mockRejectedValue(new Error("permission denied"));
		const reinit = vi.fn();

		const wrapped = withRetry(fn, instance, reinit);
		await expect(wrapped()).rejects.toThrow("permission denied");
		expect(reinit).not.toHaveBeenCalled();
	});

	it("wraps reinitialization failures", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const instance = {};
		const fn = vi.fn().mockRejectedValue(new Error("socket hang up"));
		const reinit = vi.fn().mockRejectedValue(new Error("reinit blew up"));

		const wrapped = withRetry(fn, instance, reinit);
		await expect(wrapped()).rejects.toThrow(
			"Failed to reinitialize resources: Error: reinit blew up",
		);
	});

	it("rethrows when maxRetries are exhausted", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const instance = {};
		const fn = vi.fn().mockRejectedValue(new Error("closed"));
		const reinit = vi.fn().mockResolvedValue(undefined);

		const wrapped = withRetry(fn, instance, reinit, 1);
		await expect(wrapped()).rejects.toThrow("closed");
		expect(fn).toHaveBeenCalledTimes(2);
		expect(reinit).toHaveBeenCalledTimes(1);
	});
});

describe("retryOnClosedResource", () => {
	it("decorates a method with the same retry behavior", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const reinit = vi.fn().mockResolvedValue(undefined);
		let calls = 0;

		class Sample {
			async work() {
				calls += 1;
				if (calls === 1) {
					throw new Error("closed");
				}
				return "done";
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(reinit, 1)(Sample.prototype, "work", descriptor);
		Object.defineProperty(Sample.prototype, "work", descriptor);

		const sample = new Sample();
		await expect(sample.work()).resolves.toBe("done");
		expect(calls).toBe(2);
		expect(reinit).toHaveBeenCalledTimes(1);
	});
});
