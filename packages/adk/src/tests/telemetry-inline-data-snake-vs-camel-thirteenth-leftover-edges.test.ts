import { describe, expect, it } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

/**
 * Thirteenth leftover: parts?.filter((part) => !part.inlineData) is camel-only.
 * Existing leftover pins camel falsy-keep; snake inline_data is never filtered.
 */
describe("telemetry inline_data snake vs camel thirteenth leftover edges", () => {
	const service = new TelemetryService();
	const build = (contents: any) =>
		(service as any)._buildLlmRequestForTrace({
			model: "m",
			config: {},
			contents,
		} as LlmRequest);

	it("camel inlineData blob is filtered", () => {
		const built = build([
			{
				role: "user",
				parts: [{ inlineData: { data: "bytes" } }, { text: "keep" }],
			},
		]);
		expect(built.contents[0].parts).toEqual([{ text: "keep" }]);
	});

	it("snake inline_data blob is kept", () => {
		const snake = { inline_data: { data: "bytes" } };
		const built = build([
			{
				role: "user",
				parts: [snake, { text: "keep" }],
			},
		]);
		expect(built.contents[0].parts).toEqual([snake, { text: "keep" }]);
	});

	it("both keys on one part: camel truthy filters the whole part", () => {
		const built = build([
			{
				role: "user",
				parts: [
					{
						inlineData: { data: "camel" },
						inline_data: { data: "snake" },
						text: "gone",
					},
				],
			},
		]);
		expect(built.contents[0].parts).toEqual([]);
	});

	it("falsy camel + truthy snake still kept", () => {
		const part = { inlineData: null, inline_data: { data: "bytes" } };
		const built = build([{ role: "user", parts: [part] }]);
		expect(built.contents[0].parts).toEqual([part]);
	});
});
