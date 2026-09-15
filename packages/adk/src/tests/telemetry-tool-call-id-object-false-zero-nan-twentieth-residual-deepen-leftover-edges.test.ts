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
 * `functionResponse.id || "<not specified>"` — boxed falsy `Object(false)` /
 * `Object(0)` / `Object(NaN)` stay.
 */
describe("telemetry tool-call-id object-false/zero/nan twentieth residual deepen", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "Object(false)", value: Object(false) },
		{ label: "Object(0)", value: Object(0) },
		{ label: "Object(NaN)", value: Object(Number.NaN) },
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
