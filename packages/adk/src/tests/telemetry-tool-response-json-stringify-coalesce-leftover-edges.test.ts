import { afterEach, describe, expect, it, vi } from "vitest";
import { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
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
 * Leftover: JSON.stringify(functionResponse.response) || "<not specified>"
 * undefined → undefined (coalesce); null → "null" (truthy, no coalesce).
 */
describe("telemetry tool-response JSON.stringify coalesce leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{
			label: "response undefined",
			response: undefined,
			expectedInner: "<not specified>",
		},
		{
			label: "response key omitted",
			response: Symbol.for("omit"),
			expectedInner: "<not specified>",
		},
		{
			label: "response null",
			response: null,
			expectedInner: "null",
		},
		{
			label: "response empty string",
			response: "",
			expectedInner: '""',
		},
		{
			label: "response false",
			response: false,
			expectedInner: "false",
		},
		{
			label: "response 0",
			response: 0,
			expectedInner: "0",
		},
		{
			label: "response empty object",
			response: {},
			expectedInner: "{}",
		},
	])("traceToolCall coalesces functionResponse.response ($label)", async ({
		response,
		expectedInner,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		const functionResponse: Record<string, any> = { id: "c1", name: "lookup" };
		if (response !== Symbol.for("omit")) {
			functionResponse.response = response;
		}
		service.traceToolCall(
			tool,
			{ q: 1 },
			new Event({
				author: "tool",
				invocationId: "inv",
				content: { parts: [{ functionResponse }] },
			}),
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(JSON.parse(attrs["adk.tool_response"])).toBe(expectedInner);
	});

	it("double-encodes truthy object responses via _safeJsonStringify", async () => {
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
								id: "c2",
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
			{ model: "m", contents: [], config: {} } as LlmRequest,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(JSON.parse(attrs["adk.tool_response"])).toBe('{"ok":true}');
	});

	it("missing functionResponse still uses placeholders without hitting response coalesce", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			{},
			new Event({
				author: "tool",
				content: { parts: [{ text: "no-fr" }] },
			}),
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["gen_ai.tool.call.id"]).toBe("<not specified>");
		expect(JSON.parse(attrs["adk.tool_response"])).toBe("<not specified>");
	});
});
