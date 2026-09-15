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
 * Nineteenth leftover residual deepen (complements #269 NaN/posinf):
 * `functionResponse.id || "<not specified>"` — `Object(true)` / `1` /
 * `"Infinity"` / `{}` stay (NaN collapsed).
 */
describe("telemetry tool-call-id object-true/one/infinity nineteenth residual deepen", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "empty object", value: {} },
	])("$label id stays", async ({ value }) => {
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
								id: value as any,
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(value);
	});
});
