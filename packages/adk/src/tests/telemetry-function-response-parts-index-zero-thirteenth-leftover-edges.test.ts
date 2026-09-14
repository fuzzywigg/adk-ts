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
 * Thirteenth leftover: traceToolCall only inspects parts[0].functionResponse.
 * Eleventh leftover pinned falsy FR on index 0; later parts are ignored.
 */
describe("telemetry functionResponse parts index-zero thirteenth leftover", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it("FR only on parts[1] keeps call-id sentinel", async () => {
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
						{ text: "noise" },
						{
							functionResponse: {
								id: "hidden-id",
								name: "lookup",
								response: { ok: true },
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

	it("FR on parts[0] is used even with extra parts (control)", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: {
					parts: [
						{
							functionResponse: {
								id: "visible",
								name: "lookup",
								response: {},
							},
						},
						{
							functionResponse: {
								id: "ignored",
								name: "lookup",
								response: {},
							},
						},
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"visible",
		);
	});

	it("snake function_response on parts[0] is skipped (camel-only)", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: {
					parts: [
						{
							function_response: {
								id: "snake-id",
								name: "lookup",
								response: {},
							},
						} as any,
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});

	it("empty parts keep sentinel", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: { parts: [] },
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});
});
