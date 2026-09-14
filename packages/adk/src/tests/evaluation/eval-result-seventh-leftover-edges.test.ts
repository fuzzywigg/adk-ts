import { describe, expect, it, vi } from "vitest";
import { EvalResult } from "../../evaluation/eval-result";

describe("EvalResult seventh leftover edges (post #158)", () => {
	it("preserves negative creationTimestamp (truthy for ||)", () => {
		const result = new EvalResult({ creationTimestamp: -1 });
		expect(result.creationTimestamp).toBe(-1);
	});

	it("preserves negative fractional creationTimestamp", () => {
		const result = new EvalResult({ creationTimestamp: -0.5 });
		expect(result.creationTimestamp).toBe(-0.5);
	});

	it("still replaces 0 via || with Date.now()/1000", () => {
		vi.spyOn(Date, "now").mockReturnValue(12_000);
		const result = new EvalResult({ creationTimestamp: 0 });
		expect(result.creationTimestamp).toBe(12);
		vi.restoreAllMocks();
	});

	it("NaN creationTimestamp is falsy for || and falls back to Date.now()/1000", () => {
		vi.spyOn(Date, "now").mockReturnValue(88_000);
		const result = new EvalResult({ creationTimestamp: Number.NaN });
		expect(result.creationTimestamp).toBe(88);
		vi.restoreAllMocks();
	});
});
