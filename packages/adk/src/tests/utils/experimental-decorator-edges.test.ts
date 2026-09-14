import { afterEach, describe, expect, it, vi } from "vitest";
import { experimental } from "../../utils/experimental-decorator";

describe("experimental decorator edges", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("targetOrDescriptor?.value falsy unchanged", () => {
		it.each([
			{ value: 0, label: "zero" },
			{ value: "", label: "empty string" },
			{ value: false, label: "false" },
			{ value: null, label: "null" },
		])("returns descriptor unchanged when value is $label", ({ value }) => {
			const descriptor = { value };
			expect(experimental(descriptor)).toBe(descriptor);
		});

		it("returns descriptor unchanged when value is undefined", () => {
			const descriptor = { value: undefined };
			expect(experimental(descriptor)).toBe(descriptor);
		});

		it("does not warn when returning falsy-value descriptors", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			experimental({ value: 0 });
			experimental({ value: "" });
			experimental({ value: null });
			expect(warn).not.toHaveBeenCalled();
		});
	});

	describe("empty .name function", () => {
		it("warns with empty name for anonymous function targets", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const anon = (
				() => () =>
					"anon"
			)();
			const returned = experimental(anon);
			expect(returned).toBe(anon);
			expect(warn).toHaveBeenCalledWith(
				"Warning: Using experimental feature ''",
			);
		});

		it("warns with empty name for anonymous class constructors", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			const Anon = experimental(class {});
			expect(warn).toHaveBeenCalledWith(
				"Warning: Using experimental feature ''",
			);
			expect(new Anon()).toBeInstanceOf(Anon);
		});
	});

	describe("function vs descriptor paths", () => {
		it("returns non-function targets unchanged", () => {
			expect(experimental(null)).toBeNull();
			expect(experimental(undefined)).toBeUndefined();
			const plain = { meta: true };
			expect(experimental(plain)).toBe(plain);
		});

		it("warns with named function identity", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			function namedFn() {
				return 1;
			}
			expect(experimental(namedFn)).toBe(namedFn);
			expect(warn).toHaveBeenCalledWith(
				"Warning: Using experimental feature 'namedFn'",
			);
		});

		it("wraps method descriptors and warns on invocation", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			class Host {
				run() {
					return 42;
				}
			}
			const descriptor = Object.getOwnPropertyDescriptor(
				Host.prototype,
				"run",
			)!;
			experimental(descriptor);
			Object.defineProperty(Host.prototype, "run", descriptor);
			expect(new Host().run()).toBe(42);
			expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature");
		});
	});
});
