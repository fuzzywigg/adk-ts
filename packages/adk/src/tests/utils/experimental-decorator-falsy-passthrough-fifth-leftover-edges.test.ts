import { afterEach, describe, expect, it, vi } from "vitest";
import { experimental } from "../../utils/experimental-decorator";

describe("experimental decorator falsy descriptor fifth leftover (post #165)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("warns and returns class constructor unchanged", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		class DemoExperimental {}
		const result = experimental(DemoExperimental);
		expect(result).toBe(DemoExperimental);
		expect(warn).toHaveBeenCalledWith(
			"Warning: Using experimental feature 'DemoExperimental'",
		);
	});

	it("wraps method descriptor.value and warns on each call", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const original = vi.fn(function (this: any, x: number) {
			return x * 2;
		});
		const descriptor = { value: original };
		const wrapped = experimental(descriptor);
		expect(wrapped).toBe(descriptor);
		expect(descriptor.value(3)).toBe(6);
		expect(original).toHaveBeenCalledWith(3);
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature");
	});

	it.each([
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: '""', value: "" },
	] as const)("returns descriptor unchanged when value is falsy $label (no wrap)", ({
		value,
	}) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const descriptor = { value: value as any, enumerable: true };
		const result = experimental(descriptor);
		expect(result).toBe(descriptor);
		expect(result.value).toBe(value);
		expect(warn).not.toHaveBeenCalled();
	});

	it.each([
		{ label: "null", target: null },
		{ label: "undefined", target: undefined },
		{ label: "0", target: 0 },
		{ label: "false", target: false },
		{ label: '""', target: "" },
		{ label: "plain object without value", target: { other: 1 } },
	] as const)("passthrough for non-function non-value target: $label", ({
		target,
	}) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		expect(experimental(target as any)).toBe(target);
		expect(warn).not.toHaveBeenCalled();
	});

	it("anonymous function still warns with empty name", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const fn = () => {};
		Object.defineProperty(fn, "name", { value: "" });
		expect(experimental(fn)).toBe(fn);
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature ''");
	});
});
