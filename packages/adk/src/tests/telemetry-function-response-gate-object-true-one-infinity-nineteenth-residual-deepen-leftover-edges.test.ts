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
 * Nineteenth leftover residual deepen (complements #269 gate residual):
 * `if (functionResponse)` — `Object(true)` / `1` / `"Infinity"` / `{}` enter
 * and hit `id || "<not specified>"` (no id prop → sentinel).
 */
describe("telemetry functionResponse gate object-true/one/infinity nineteenth residual deepen", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "Object(true)", value: Object(true) },
		{ label: "number 1", value: 1 },
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "empty object", value: {} },
	])("truthy residual functionResponse ($label) enters id || sentinel", async ({
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
