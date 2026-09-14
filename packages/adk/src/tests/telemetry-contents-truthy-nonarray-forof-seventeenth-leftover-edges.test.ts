import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Seventeenth leftover: `for (const content of llmRequest.contents || [])`.
 * Leftover/sixth covered falsy coalesce to []. Truthy non-arrays bypass `|| []`:
 * iterable strings yield per-char shells; non-iterables throw.
 */
describe("telemetry contents truthy nonarray forof seventeenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "empty string", contents: "" },
		{ label: "0", contents: 0 },
		{ label: "false", contents: false },
		{ label: "null", contents: null },
		{ label: "undefined", contents: undefined },
	])("falsy contents ($label) still coalesce to []", ({ contents }) => {
		expect(build(contents).contents).toEqual([]);
	});

	it('truthy string "0" iterates code units into N empty shells', () => {
		const result = build("0");
		expect(result.contents).toHaveLength(1);
		expect(result.contents[0]).toEqual({ role: undefined, parts: [] });
	});

	it("truthy whitespace string iterates each space into a shell", () => {
		const result = build("  ");
		expect(result.contents).toHaveLength(2);
		expect(result.contents.every((c: any) => c.role === undefined)).toBe(true);
		expect(result.contents.every((c: any) => Array.isArray(c.parts))).toBe(
			true,
		);
	});

	it.each([
		{ label: "empty object", contents: {} },
		{ label: "1", contents: 1 },
		{ label: "true", contents: true },
	])("truthy non-iterable $label throws on for-of", ({ contents }) => {
		expect(() => build(contents)).toThrow();
	});

	it("real array still builds role/parts shells", () => {
		expect(build([{ role: "user", parts: [{ text: "hi" }] }]).contents).toEqual(
			[{ role: "user", parts: [{ text: "hi" }] }],
		);
	});
});
