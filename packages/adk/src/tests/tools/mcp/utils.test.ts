import { describe, expect, it, vi } from "vitest";
import { retryOnClosedResource, withRetry } from "../../../tools/mcp/utils";

describe("withRetry", () => {
	it("returns successfully without retry", async () => {
		const instance = { value: 1 };
		const fn = vi.fn(async function (this: typeof instance) {
			return this.value;
		});
		const reinit = vi.fn(async () => undefined);

		const wrapped = withRetry(fn, instance, reinit);
		await expect(wrapped()).resolves.toBe(1);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("retries on closed / ECONNRESET / socket hang up errors", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);

		for (const message of ["resource closed", "ECONNRESET", "socket hang up"]) {
			let attempts = 0;
			const fn = vi.fn(async () => {
				attempts++;
				if (attempts === 1) {
					throw new Error(message);
				}
				return "ok";
			});

			const wrapped = withRetry(fn, instance, reinit, 1);
			await expect(wrapped()).resolves.toBe("ok");
			expect(fn).toHaveBeenCalledTimes(2);
		}

		expect(reinit).toHaveBeenCalledTimes(3);
	});

	it("throws immediately for non-closed errors", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("permission denied");
		});

		const wrapped = withRetry(fn, instance, reinit, 3);
		await expect(wrapped()).rejects.toThrow("permission denied");
		expect(reinit).not.toHaveBeenCalled();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("throws when reinitialization fails", async () => {
		const instance = {};
		const reinit = vi.fn(async () => {
			throw new Error("reinit boom");
		});
		const fn = vi.fn(async () => {
			throw new Error("connection closed");
		});

		const wrapped = withRetry(fn, instance, reinit, 1);
		await expect(wrapped()).rejects.toThrow("Failed to reinitialize resources");
		expect(reinit).toHaveBeenCalledTimes(1);
	});

	it("exhausts maxRetries and rethrows the closed error", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("closed");
		});

		const wrapped = withRetry(fn, instance, reinit, 1);
		await expect(wrapped()).rejects.toThrow("closed");
		expect(fn).toHaveBeenCalledTimes(2);
		expect(reinit).toHaveBeenCalledTimes(1);
	});

	it("throws unexpected end of retry loop when maxRetries skips the loop", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => "never");

		const wrapped = withRetry(fn, instance, reinit, -1);
		await expect(wrapped()).rejects.toThrow("Unexpected end of retry loop");
		expect(fn).not.toHaveBeenCalled();
		expect(reinit).not.toHaveBeenCalled();
	});

	it("does not retry non-Error throws even when message-like", async () => {
		const instance = {};
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw "closed resource";
		});

		const wrapped = withRetry(fn, instance, reinit, 2);
		await expect(wrapped()).rejects.toBe("closed resource");
		expect(reinit).not.toHaveBeenCalled();
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

describe("retryOnClosedResource", () => {
	it("wraps a method descriptor with the same retry behavior", async () => {
		const reinit = vi.fn(async () => undefined);
		let attempts = 0;

		class Sample {
			async work(): Promise<string> {
				attempts++;
				if (attempts === 1) {
					throw new Error("closed");
				}
				return "done";
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(() => reinit(), 1)(
			Sample.prototype,
			"work",
			descriptor,
		);
		Object.defineProperty(Sample.prototype, "work", descriptor);

		const sample = new Sample();
		await expect(sample.work()).resolves.toBe("done");
		expect(reinit).toHaveBeenCalledTimes(1);
		expect(attempts).toBe(2);
	});

	it("rethrows non-closed errors and reinit failures from the decorator", async () => {
		const reinit = vi.fn(async () => {
			throw new Error("reinit failed");
		});

		class Sample {
			async boom(): Promise<string> {
				throw new Error("permission denied");
			}
			async closed(): Promise<string> {
				throw new Error("closed");
			}
		}

		for (const key of ["boom", "closed"] as const) {
			const descriptor = Object.getOwnPropertyDescriptor(
				Sample.prototype,
				key,
			)!;
			retryOnClosedResource(() => reinit(), 1)(
				Sample.prototype,
				key,
				descriptor,
			);
			Object.defineProperty(Sample.prototype, key, descriptor);
		}

		const sample = new Sample();
		await expect(sample.boom()).rejects.toThrow("permission denied");
		expect(reinit).not.toHaveBeenCalled();
		await expect(sample.closed()).rejects.toThrow(
			"Failed to reinitialize resources",
		);
		expect(reinit).toHaveBeenCalledTimes(1);
	});

	it("returns the descriptor unchanged when value is missing", () => {
		const descriptor: TypedPropertyDescriptor<() => Promise<string>> = {};
		const result = retryOnClosedResource(async () => undefined)(
			{},
			"missing",
			descriptor,
		);
		expect(result).toBe(descriptor);
	});
});
