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
 * Twentieth leftover residual deepen (complements #282 object-true/one/infinity):
 * `if (functionResponse)` — boxed falsy `Object(false)` / `Object(0)` /
 * `Object(NaN)` enter and hit `id || "<not specified>"` (no id prop → sentinel).
 */
describe("telemetry functionResponse gate object-false/zero/nan twentieth residual deepen", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
	])("boxed residual functionResponse ($label) enters id || sentinel", async ({
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
