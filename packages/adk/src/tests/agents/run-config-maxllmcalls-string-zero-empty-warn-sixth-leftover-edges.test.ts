import { afterEach, describe, expect, it, vi } from "vitest";
import { RunConfig } from "../../agents/run-config";

/**
 * Sixth leftover: maxLlmCalls uses `?? 500`, so string `"0"` / `""` are kept
 * (non-nullish). `"" <= 0` and `"0" <= 0` both coerce and warn. Fifth leftover
 * pinned numeric `0` + null→500; this pins the string-truthy / empty traps.
 */
describe("RunConfig maxLlmCalls string-zero empty warn sixth leftover", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('string "0" is preserved via ?? and warns via <= 0 coercion', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "0" as any });
		expect(config.maxLlmCalls).toBe("0");
		expect(warn).toHaveBeenCalled();
	});

	it("empty-string maxLlmCalls is preserved via ?? and warns", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "" as any });
		expect(config.maxLlmCalls).toBe("");
		expect(warn).toHaveBeenCalled();
	});

	it('string "00" also warns via ToNumber coercion', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "00" as any });
		expect(config.maxLlmCalls).toBe("00");
		expect(warn).toHaveBeenCalled();
	});

	it('string "500" is preserved and does not warn', () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const config = new RunConfig({ maxLlmCalls: "500" as any });
		expect(config.maxLlmCalls).toBe("500");
		expect(warn).not.toHaveBeenCalled();
	});

	it("null still coalesces to 500 (fifth control vs string zero)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(new RunConfig({ maxLlmCalls: null as any }).maxLlmCalls).toBe(500);
		expect(warn).not.toHaveBeenCalled();
	});

	it("numeric 0 still preserved and warns (fifth control)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(new RunConfig({ maxLlmCalls: 0 }).maxLlmCalls).toBe(0);
		expect(warn).toHaveBeenCalled();
	});
});
