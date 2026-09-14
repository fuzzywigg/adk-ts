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

	it("returns descriptors with falsy value fields unchanged", () => {
		const zeroValue = { value: 0 };
		const emptyValue = { value: "" };
		const falseValue = { value: false };
		expect(experimental(zeroValue)).toBe(zeroValue);
		expect(experimental(emptyValue)).toBe(emptyValue);
		expect(experimental(falseValue)).toBe(falseValue);
	});

	it("preserves this binding when wrapping instance methods", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		class Host {
			label = "bound";
			read() {
				return this.label;
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "read")!;
		experimental(descriptor);
		Object.defineProperty(Host.prototype, "read", descriptor);

		expect(new Host().read()).toBe("bound");
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("still warns when the wrapped method throws", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		class Host {
			fail() {
				throw new Error("boom");
			}
		}

		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "fail")!;
		experimental(descriptor);
		Object.defineProperty(Host.prototype, "fail", descriptor);

		expect(() => new Host().fail()).toThrow("boom");
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature");
	});

	it("returns the same descriptor object reference after wrapping", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		class Host {
			ping() {
				return "pong";
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "ping")!;
		const returned = experimental(descriptor);
		expect(returned).toBe(descriptor);
		expect(warn).not.toHaveBeenCalled();
		Object.defineProperty(Host.prototype, "ping", returned);
		expect(new Host().ping()).toBe("pong");
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("warns for named function targets using their name", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const namedArrow = function namedArrowFn() {
			return 1;
		};
		expect(experimental(namedArrow)).toBe(namedArrow);
		expect(warn).toHaveBeenCalledWith(
			"Warning: Using experimental feature 'namedArrowFn'",
		);
	});

	it("warns for anonymous class constructors with empty names", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const Anon = experimental(class {});
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature ''");
		expect(new Anon()).toBeInstanceOf(Anon);
	});
});
