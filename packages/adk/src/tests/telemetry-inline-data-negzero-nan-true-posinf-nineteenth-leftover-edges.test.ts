import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #258):
 * `!part.inlineData` after classic falsy-keep leftover. `-0`/`NaN` keep;
 * `true`/`"true"`/`[]`/`±Infinity` filter out.
 */
describe("telemetry inlineData negzero nan true posinf nineteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it.each([
		{ label: "-0", inlineData: -0 },
		{ label: "NaN", inlineData: Number.NaN },
	])("falsy near-miss inlineData $label is kept", ({ inlineData }) => {
		const built = build([
			{
				role: "user",
				parts: [{ text: "t", inlineData }, { text: "keep-always" }],
			},
		]);
		expect(built.contents[0].parts).toEqual([
			{ text: "t", inlineData },
			{ text: "keep-always" },
		]);
	});

	it.each([
		{ label: "true", inlineData: true },
		{ label: "string true", inlineData: "true" },
		{ label: "empty array", inlineData: [] },
		{ label: "POSITIVE_INFINITY", inlineData: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", inlineData: Number.NEGATIVE_INFINITY },
	])("truthy near-miss inlineData $label is filtered", ({ inlineData }) => {
		const built = build([
			{
				role: "user",
				parts: [{ text: "t", inlineData }, { text: "keep-always" }],
			},
		]);
		expect(built.contents[0].parts).toEqual([{ text: "keep-always" }]);
	});
});
