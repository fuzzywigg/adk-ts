import { afterEach, describe, expect, it, vi } from "vitest";
import { experimental } from "../../utils/experimental-decorator";

describe("experimental", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("warns when decorating a class constructor", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		@experimental
		class ExperimentalFeature {}

		expect(warn).toHaveBeenCalledWith(
			"Warning: Using experimental feature 'ExperimentalFeature'",
		);
		expect(new ExperimentalFeature()).toBeInstanceOf(ExperimentalFeature);
	});

	it("warns when an experimental method is invoked", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		class Host {
			run() {
				return 42;
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "run")!;
		experimental(descriptor);
		Object.defineProperty(Host.prototype, "run", descriptor);

		expect(new Host().run()).toBe(42);
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature");
	});

	it("returns non-function targets unchanged", () => {
		const target = { value: undefined };
		expect(experimental(target)).toBe(target);
	});

	it("returns nullish and plain object targets unchanged", () => {
		expect(experimental(null)).toBeNull();
		expect(experimental(undefined)).toBeUndefined();
		const plain = { meta: true };
		expect(experimental(plain)).toBe(plain);
	});

	it("wraps method descriptors so each call warns again", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		class Host {
			greet(name: string) {
				return `hi ${name}`;
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(
			Host.prototype,
			"greet",
		)!;
		const wrapped = experimental(descriptor);
		Object.defineProperty(Host.prototype, "greet", wrapped);

		const host = new Host();
		expect(host.greet("a")).toBe("hi a");
		expect(host.greet("b")).toBe("hi b");
		expect(warn).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenNthCalledWith(
			1,
			"Warning: Using experimental feature",
		);
		expect(warn).toHaveBeenNthCalledWith(
			2,
			"Warning: Using experimental feature",
		);
	});

	it("preserves named function identity when decorating a standalone function", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		function experimentalHelper() {
			return 7;
		}

		const returned = experimental(experimentalHelper);
		expect(returned).toBe(experimentalHelper);
		expect(returned()).toBe(7);
		expect(warn).toHaveBeenCalledWith(
			"Warning: Using experimental feature 'experimentalHelper'",
		);
	});

	it("warns with empty name for anonymous function targets", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const anon = (
			() => () =>
				"anon"
		)();

		const returned = experimental(anon);
		expect(returned).toBe(anon);
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature ''");
	});
});
