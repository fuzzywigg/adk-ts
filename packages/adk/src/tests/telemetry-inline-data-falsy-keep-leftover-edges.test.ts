import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Leftover: parts?.filter((part) => !part.inlineData) || []
 * Truthy inlineData (incl. {}) filtered; falsy inlineData kept.
 */
describe("telemetry inlineData falsy-keep leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "undefined", inlineData: undefined, keep: true },
		{ label: "null", inlineData: null, keep: true },
		{ label: "empty string", inlineData: "", keep: true },
		{ label: "0", inlineData: 0, keep: true },
		{ label: "false", inlineData: false, keep: true },
		{ label: "empty object", inlineData: {}, keep: false },
		{
			label: "populated blob",
			inlineData: { data: "abc", mimeType: "text/plain" },
			keep: false,
		},
	])("inlineData=$label keep=$keep", ({ inlineData, keep }) => {
		const built = build([
			{
				role: "user",
				parts: [{ text: "t", inlineData }, { text: "keep-always" }],
			},
		]);
		if (keep) {
			expect(built.contents[0].parts).toEqual([
				{ text: "t", inlineData },
				{ text: "keep-always" },
			]);
		} else {
			expect(built.contents[0].parts).toEqual([{ text: "keep-always" }]);
		}
	});

	it.each([
		{ label: "parts omitted", parts: Symbol.for("omit") },
		{ label: "parts undefined", parts: undefined },
		{ label: "parts null", parts: null },
	])("$label coalesces to [] via || []", ({ parts }) => {
		const content: Record<string, any> = { role: "user" };
		if (parts !== Symbol.for("omit")) {
			content.parts = parts;
		}
		const built = build([content]);
		expect(built.contents[0].parts).toEqual([]);
	});

	it("empty parts array stays empty", () => {
		const built = build([{ role: "user", parts: [] }]);
		expect(built.contents[0].parts).toEqual([]);
	});

	it("mixed contents: one filtered, one kept, one null-parts", () => {
		const built = build([
			{
				role: "user",
				parts: [
					{ inlineData: { data: "x" } },
					{ text: "ok", inlineData: null },
				],
			},
			{ role: "model", parts: null },
			{
				role: "user",
				parts: [{ inlineData: {} }, { text: "survives" }],
			},
		]);
		expect(built.contents).toEqual([
			{ role: "user", parts: [{ text: "ok", inlineData: null }] },
			{ role: "model", parts: [] },
			{ role: "user", parts: [{ text: "survives" }] },
		]);
	});
});
