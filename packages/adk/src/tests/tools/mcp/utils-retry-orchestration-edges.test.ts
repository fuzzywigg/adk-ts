import { afterEach, describe, expect, it, vi } from "vitest";
import { retryOnClosedResource, withRetry } from "../../../tools/mcp/utils";

const RETRYABLE_MESSAGES = [
	"closed",
	"resource closed",
	"connection was closed by peer",
	"ECONNRESET",
	"upstream ECONNRESET during read",
	"socket hang up",
	"client socket hang up unexpectedly",
] as const;

const NON_RETRYABLE_CASES = [
	{ label: "permission denied", error: () => new Error("permission denied") },
	{ label: "CLOSED uppercase", error: () => new Error("CLOSED") },
	{ label: "econnreset lowercase", error: () => new Error("econnreset") },
	{
		label: "socket hangup missing space",
		error: () => new Error("socket hangup"),
	},
	{ label: "close without d", error: () => new Error("close") },
	{ label: "TypeError", error: () => new TypeError("bad args") },
	{ label: "string throw containing closed", error: () => "resource closed" },
	{ label: "number throw", error: () => 42 },
	{ label: "null throw", error: () => null },
	{ label: "object throw", error: () => ({ message: "closed" }) },
] as const;

describe("MCP withRetry non-retryable classification leftovers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each(
		NON_RETRYABLE_CASES,
	)("classifies $label as non-retryable and skips reinit", async ({
		error,
	}) => {
		const reinit = vi.fn(async () => undefined);
		const thrown = error();
		const fn = vi.fn(async () => {
			throw thrown;
		});
		const wrapped = withRetry(fn, {}, reinit, 5);

		await expect(wrapped()).rejects.toBe(thrown);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(reinit).not.toHaveBeenCalled();
	});

	it.each(
		RETRYABLE_MESSAGES,
	)("classifies %s as retryable and reinits before success", async (message) => {
		const reinit = vi.fn(async () => undefined);
		let attempts = 0;
		const fn = vi.fn(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error(message);
			return `recovered:${message}`;
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const wrapped = withRetry(fn, {}, reinit, 1);
		await expect(wrapped()).resolves.toBe(`recovered:${message}`);
		expect(reinit).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.stringMatching(/Resource closed, reinitializing/),
		);
		warn.mockRestore();
	});
});

describe("MCP withRetry max-retry exhaustion leftovers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		0, 1, 2, 3,
	])("exhausts maxRetries=%s on persistent closed errors without exceeding attempts", async (maxRetries) => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("closed");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const wrapped = withRetry(fn, {}, reinit, maxRetries);

		await expect(wrapped()).rejects.toThrow("closed");
		expect(fn).toHaveBeenCalledTimes(maxRetries + 1);
		expect(reinit).toHaveBeenCalledTimes(maxRetries);
		warn.mockRestore();
	});

	it("maxRetries=0 treats closed errors as already exhausted (no reinit)", async () => {
		const reinit = vi.fn(async () => undefined);
		const fn = vi.fn(async () => {
			throw new Error("socket hang up");
		});
		const wrapped = withRetry(fn, {}, reinit, 0);

		await expect(wrapped()).rejects.toThrow("socket hang up");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("rethrows the final closed error after the last allowed reinit", async () => {
		const reinit = vi.fn(async () => undefined);
		const errors = [
			new Error("closed-1"),
			new Error("closed-2"),
			new Error("closed-3"),
		];
		let i = 0;
		const fn = vi.fn(async () => {
			throw errors[i++];
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const wrapped = withRetry(fn, {}, reinit, 2);

		await expect(wrapped()).rejects.toBe(errors[2]);
		expect(reinit).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});

	it("stops retrying when a later attempt becomes non-retryable", async () => {
		const reinit = vi.fn(async () => undefined);
		let attempts = 0;
		const fn = vi.fn(async () => {
			attempts += 1;
			if (attempts === 1) throw new Error("ECONNRESET");
			throw new Error("permission denied");
		});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const wrapped = withRetry(fn, {}, reinit, 5);

		await expect(wrapped()).rejects.toThrow("permission denied");
		expect(fn).toHaveBeenCalledTimes(2);
		expect(reinit).toHaveBeenCalledTimes(1);
		warn.mockRestore();
	});
});

describe("MCP retryOnClosedResource decorator exhaustion leftovers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each(
		NON_RETRYABLE_CASES.slice(0, 6),
	)("decorator classifies $label as non-retryable", async ({ error }) => {
		const reinit = vi.fn(async () => undefined);
		const thrown = error();

		class Sample {
			async work(): Promise<string> {
				throw thrown as any;
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(() => reinit(), 3)(
			Sample.prototype,
			"work",
			descriptor,
		);
		Object.defineProperty(Sample.prototype, "work", descriptor);

		await expect(new Sample().work()).rejects.toBe(thrown);
		expect(reinit).not.toHaveBeenCalled();
	});

	it("decorator exhausts maxRetries then rethrows the closed error", async () => {
		const reinit = vi.fn(async () => undefined);
		class Sample {
			async work(): Promise<string> {
				throw new Error("resource closed");
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(() => reinit(), 2)(
			Sample.prototype,
			"work",
			descriptor,
		);
		Object.defineProperty(Sample.prototype, "work", descriptor);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		await expect(new Sample().work()).rejects.toThrow("resource closed");
		expect(reinit).toHaveBeenCalledTimes(2);
		warn.mockRestore();
	});

	it("decorator maxRetries=0 never reinits on closed errors", async () => {
		const reinit = vi.fn(async () => undefined);
		class Sample {
			async work(): Promise<string> {
				throw new Error("closed");
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Sample.prototype,
			"work",
		)!;
		retryOnClosedResource(() => reinit(), 0)(
			Sample.prototype,
			"work",
			descriptor,
		);
		Object.defineProperty(Sample.prototype, "work", descriptor);

		await expect(new Sample().work()).rejects.toThrow("closed");
		expect(reinit).not.toHaveBeenCalled();
	});
});
