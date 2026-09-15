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
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `functionResponse.id || "<not specified>"` — boxed-falsy / `"-Infinity"` /
 * `-1` stay (primitive falsy would sentinel).
 */
describe("telemetry tool-call-id object-false/zero/empty nineteenth residual deepen", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: 'Object("")', value: Object("") },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
		{ label: 'string "-Infinity"', value: "-Infinity" },
		{ label: "number -1", value: -1 },
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
