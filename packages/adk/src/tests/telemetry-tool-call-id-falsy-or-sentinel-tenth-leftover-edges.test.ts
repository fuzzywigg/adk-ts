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
 * Tenth leftover: functionResponse.id || "<not specified>" — response-body coalesce
 * is covered elsewhere; the id arm falsy matrix is not.
 */
describe("telemetry tool-call-id falsy-or-sentinel tenth leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "empty string", id: "", expected: "<not specified>" },
		{ label: "null", id: null, expected: "<not specified>" },
		{ label: "0", id: 0, expected: "<not specified>" },
		{ label: "false", id: false, expected: "<not specified>" },
		{ label: "undefined", id: undefined, expected: "<not specified>" },
		{ label: "truthy id", id: "call-1", expected: "call-1" },
	])("traceToolCall coalesces functionResponse.id ($label)", async ({
		id,
		expected,
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
								id,
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.tool.call.id"]).toBe(expected);
	});

	it("omitted id key still coalesces to sentinel", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: {
					parts: [{ functionResponse: { name: "lookup", response: {} } }],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});
});
