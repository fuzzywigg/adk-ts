import { afterEach, describe, expect, it, vi } from "vitest";
import { retryOnClosedResource, withRetry } from "../../../tools/mcp/utils";

/**
 * Seventeenth leftover (error path): `Failed to reinitialize resources:
 * ${reinitError}` string-interpolates non-Error values (not Error.message).
 * Distinct from #220 and prior Error-only reinit failure coverage.
 */
describe("mcp-utils reinit error string interpolate seventeenth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([
		{
			label: "string",
			value: "reinit-string-fail",
			contains: "reinit-string-fail",
		},
		{ label: "number", value: 503, contains: "503" },
		{ label: "object", value: { code: "X" }, contains: "[object Object]" },
		{ label: "null", value: null, contains: "null" },
		{ label: "undefined", value: undefined, contains: "undefined" },
	] as const)("withRetry interpolates non-Error reinit $label", async ({
		value,
		contains,
	}) => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const reinit = vi.fn(async () => {
			throw value;
		});
		const fn = vi.fn(async () => {
			throw new Error("closed");
		});

		await expect(withRetry(fn, {}, reinit, 1)()).rejects.toThrow(
			`Failed to reinitialize resources: ${contains}`,
		);
		expect(errorSpy).toHaveBeenCalledWith(
			"Error reinitializing resources:",
			value,
		);
		warn.mockRestore();
		errorSpy.mockRestore();
	});

	it("decorator interpolates non-Error reinit string the same way", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const reinit = vi.fn(async () => {
			throw "decorator-reinit-fail";
		});

		class Sample {
			async work(): Promise<string> {
				throw new Error("socket hang up");
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

		await expect(new Sample().work()).rejects.toThrow(
			"Failed to reinitialize resources: decorator-reinit-fail",
		);
		errorSpy.mockRestore();
		warn.mockRestore();
	});

	it("Error reinit still stringifies via Error.toString (control)", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const reinit = vi.fn(async () => {
			throw new Error("reinit boom");
		});
		const fn = vi.fn(async () => {
			throw new Error("closed");
		});

		await expect(withRetry(fn, {}, reinit, 1)()).rejects.toThrow(
			"Failed to reinitialize resources: Error: reinit boom",
		);
	});
});
