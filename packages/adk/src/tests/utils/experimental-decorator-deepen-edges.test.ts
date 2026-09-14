import { afterEach, describe, expect, it, vi } from "vitest";
import { experimental } from "../../utils/experimental-decorator";

describe("experimental decorator deepen edges (TOKENMAXX remainder)", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("double-wrap descriptor warns twice per invocation", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		class Host {
			run(n: number) {
				return n * 2;
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "run")!;
		experimental(descriptor);
		experimental(descriptor);
		Object.defineProperty(Host.prototype, "run", descriptor);
		expect(new Host().run(3)).toBe(6);
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

	it("async method descriptor warns then awaits result", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		class Host {
			async load() {
				return "ready";
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "load")!;
		experimental(descriptor);
		Object.defineProperty(Host.prototype, "load", descriptor);
		await expect(new Host().load()).resolves.toBe("ready");
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature");
	});

	it("async method descriptor warns before rethrowing", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		class Host {
			async fail() {
				throw new Error("async-fail");
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(Host.prototype, "fail")!;
		experimental(descriptor);
		Object.defineProperty(Host.prototype, "fail", descriptor);
		await expect(new Host().fail()).rejects.toThrow("async-fail");
		expect(warn).toHaveBeenCalledWith("Warning: Using experimental feature");
	});

	it("preserves this binding and arity for wrapped methods", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		class Counter {
			n = 0;
			inc(by: number, extra?: number) {
				this.n += by + (extra || 0);
				return this.n;
			}
		}
		const descriptor = Object.getOwnPropertyDescriptor(
			Counter.prototype,
			"inc",
		)!;
		const originalArity = descriptor.value.length;
		experimental(descriptor);
		Object.defineProperty(Counter.prototype, "inc", descriptor);
		const c = new Counter();
		expect(c.inc(2, 3)).toBe(5);
		expect(c.n).toBe(5);
		expect(warn).toHaveBeenCalled();
		expect(originalArity).toBe(2);
	});

	it("returns getter-only descriptors unchanged without warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const descriptor: PropertyDescriptor = {
			get() {
				return 1;
			},
			enumerable: true,
			configurable: true,
		};
		expect(experimental(descriptor)).toBe(descriptor);
		expect(warn).not.toHaveBeenCalled();
	});

	it("named class constructor warns with class name", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		class ExperimentalFeature {}
		const returned = experimental(ExperimentalFeature);
		expect(returned).toBe(ExperimentalFeature);
		expect(warn).toHaveBeenCalledWith(
			"Warning: Using experimental feature 'ExperimentalFeature'",
		);
	});
});
