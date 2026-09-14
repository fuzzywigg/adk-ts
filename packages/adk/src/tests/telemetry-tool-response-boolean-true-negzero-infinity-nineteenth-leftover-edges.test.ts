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
 * Nineteenth leftover (HEAVY tip-relaunch residual after #248):
 * `JSON.stringify(functionResponse.response) || "<not specified>"`. Base
 * leftover pinned classic falsy coalesce. Residual boolean-true / `"true"` /
 * `[]` / `-0` / `-Infinity` all stringify to truthy strings so the `||`
 * sentinel is skipped (incl. `JSON.stringify(-Infinity) === "null"`).
 */
describe("telemetry tool-response boolean-true/negzero/infinity nineteenth leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "boolean true", response: true as any, expectedInner: "true" },
		{ label: "string true", response: "true", expectedInner: '"true"' },
		{ label: "empty array", response: [] as any, expectedInner: "[]" },
		{ label: "-0", response: -0 as any, expectedInner: "0" },
		{
			label: "NEGATIVE_INFINITY",
			response: Number.NEGATIVE_INFINITY as any,
			expectedInner: "null",
		},
	])("traceToolCall keeps stringified response ($label)", async ({
		response,
		expectedInner,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{ q: 1 },
			new Event({
				author: "tool",
				invocationId: "inv",
				content: {
					parts: [
						{
							functionResponse: {
								id: "c1",
								name: "lookup",
								response,
							},
						},
					],
				},
			}),
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(JSON.parse(attrs["adk.tool_response"])).toBe(expectedInner);
	});
});
