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
 * Eighteenth leftover: `functionResponse.id || "<not specified>"` residual
 * after tenth falsy matrix. Boolean `true` / string `"true"` / `[]` /
 * `NEGATIVE_INFINITY` stay; `-0` coalesces to the sentinel.
 */
describe("telemetry tool-call-id boolean-true string-true eighteenth leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "boolean true", id: true },
		{ label: "string true", id: "true" },
		{ label: "empty array", id: [] },
		{ label: "NEGATIVE_INFINITY", id: Number.NEGATIVE_INFINITY },
	])("keeps truthy near-miss id ($label)", async ({ id }) => {
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
								id,
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(id);
	});

	it("-0 SameValueZero-collapses to sentinel via ||", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				invocationId: "inv",
				content: {
					parts: [
						{
							functionResponse: {
								id: -0 as any,
								name: "lookup",
								response: {},
							},
						},
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});
});
