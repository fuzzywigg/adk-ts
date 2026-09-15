import { afterEach, describe, expect, it, vi } from "vitest";
import { Event } from "../events/event";
import { TelemetryService } from "../telemetry";
import type { BaseTool } from "../tools/base/base-tool";

afterEach(() => {
	vi.restoreAllMocks();
});

async function withActiveSpan() {
	const setAttributes = vi.fn();
	const { trace } = await import("@opentelemetry/api");
	vi.spyOn(trace, "getActiveSpan").mockReturnValue({
		setAttributes,
		addEvent: vi.fn(),
	} as any);
	return { setAttributes };
}

/**
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #258):
 * `if (functionResponse)` after eleventh classic falsy + empty-object.
 * `-0`/`NaN` skip id arm; `true`/`"true"`/`[]`/`±Infinity` enter and hit
 * `id || "<not specified>"` (no id prop → sentinel).
 */
describe("telemetry functionResponse gate negzero nan true posinf nineteenth leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "-0", value: -0 },
		{ label: "NaN", value: Number.NaN },
	])("falsy near-miss functionResponse ($label) keeps call-id sentinel", async ({
		value,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				invocationId: "inv",
				content: {
					parts: [{ functionResponse: value as any }],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});

	it.each([
		{ label: "true", value: true },
		{ label: "string true", value: "true" },
		{ label: "empty array", value: [] },
		{ label: "POSITIVE_INFINITY", value: Number.POSITIVE_INFINITY },
		{ label: "NEGATIVE_INFINITY", value: Number.NEGATIVE_INFINITY },
	])("truthy near-miss functionResponse ($label) enters id || sentinel", async ({
		value,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: {
					parts: [{ functionResponse: value as any }],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});
});
