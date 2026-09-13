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

	it("returns plain objects without a value property unchanged", () => {
		const target = { get: () => 1 };
		expect(experimental(target)).toBe(target);
	});
});
