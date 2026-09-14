import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../events/event";
import { TelemetryService } from "../telemetry";
import type { BaseTool } from "../tools";

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
 * Seventeenth leftover: traceToolCall hardcodes `adk.llm_response: "{}"`
 * regardless of event / optional llmRequest. Distinct from fifteenth optional
 * llmRequest → adk.llm_request and #219 invocation required-vs-optional.
 */
describe("telemetry toolcall llm-response always empty-object seventeenth leftover edges", () => {
	const tool = { name: "t", description: "d" } as BaseTool;

	it('hardcodes adk.llm_response "{}" even with rich functionResponse', async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		const event = {
			invocationId: "inv",
			content: {
				parts: [
					{
						functionResponse: {
							id: "c1",
							response: { ok: true, payload: [1, 2, 3] },
						},
					},
				],
			},
		} as Event;
		service.traceToolCall(tool, { a: 1 }, event, {
			model: "m",
			config: {},
			contents: [{ role: "user", parts: [{ text: "q" }] }],
		} as any);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["adk.llm_response"]).toBe("{}");
		expect(JSON.parse(attrs["adk.llm_request"]).model).toBe("m");
		expect(attrs["adk.tool_response"]).not.toBe("{}");
	});

	it('still "{}" when llmRequest omitted', async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, {
			invocationId: "inv2",
			content: {
				parts: [{ functionResponse: { id: "c2", response: "x" } }],
			},
		} as Event);
		expect(setAttributes.mock.calls[0][0]["adk.llm_response"]).toBe("{}");
		expect(setAttributes.mock.calls[0][0]["adk.llm_request"]).toBe("{}");
	});

	it("traceLlmCall still stringifies real llmResponse (contrast)", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			{
				session: { id: "s1" },
				userId: "u1",
			} as any,
			"e1",
			{ model: "m", config: {}, contents: [] } as any,
			{
				content: { role: "model", parts: [{ text: "hello" }] },
				finishReason: "STOP",
			} as any,
		);
		const payload = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_response"],
		);
		expect(payload.content.parts[0].text).toBe("hello");
	});
});
