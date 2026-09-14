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
 * Eleventh leftover: if (functionResponse) gate before id || sentinel.
 * Tenth covers falsy id on a truthy FR object; falsy FR itself skips the arm.
 */
describe("telemetry functionResponse truthy-gate eleventh leftover", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{ label: "0", value: 0 },
		{ label: '""', value: "" },
		{ label: "false", value: false },
		{ label: "null", value: null },
		{ label: "undefined", value: undefined },
	])("falsy functionResponse ($label) keeps call-id sentinel", async ({
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

	it("truthy empty-object functionResponse still runs id || sentinel", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: {
					parts: [{ functionResponse: {} as any }],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			"<not specified>",
		);
	});

	it("whitespace id is truthy so || does not apply sentinel", async () => {
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
								id: " ",
								name: "lookup",
								response: {},
							},
						},
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(" ");
	});
});
