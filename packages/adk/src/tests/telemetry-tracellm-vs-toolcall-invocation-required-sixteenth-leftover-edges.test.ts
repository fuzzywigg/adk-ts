import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
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
 * Sixteenth leftover: `traceLlmCall` always reads `invocationContext.session.id`
 * (required); `traceToolCall` uses optional `...(invocationContext && {…})`.
 * Fifteenth only exercised the tool-call spread arm.
 */
describe("telemetry tracellm vs toolcall invocation required sixteenth leftover edges", () => {
	const tool = { name: "t", description: "d" } as BaseTool;
	const event = {
		invocationId: "inv",
		content: {
			parts: [{ functionResponse: { id: "c1", response: { ok: true } } }],
		},
	} as Event;
	const request = {
		model: "m",
		config: {},
		contents: [],
	} as LlmRequest;
	const response = {
		content: { role: "model", parts: [{ text: "x" }] },
	} as LlmResponse;

	it.each([
		{ label: "undefined", ctx: undefined },
		{ label: "null", ctx: null },
		{ label: "0", ctx: 0 },
		{ label: "false", ctx: false },
		{ label: "empty string", ctx: "" },
	])("traceToolCall omits session attrs for falsy ctx ($label); traceLlmCall throws", async ({
		ctx,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, undefined, ctx as any);
		const toolAttrs = setAttributes.mock.calls[0][0];
		expect(toolAttrs).not.toHaveProperty("session.id");
		expect(toolAttrs).not.toHaveProperty("user.id");

		expect(() =>
			service.traceLlmCall(ctx as any, "e1", request, response),
		).toThrow();
	});

	it("traceLlmCall keeps session/user when context is a normal object", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			{
				invocationId: "inv-1",
				userId: "user-1",
				session: { id: "sess-1" },
			} as any,
			"e1",
			request,
			response,
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["session.id"]).toBe("sess-1");
		expect(attrs["user.id"]).toBe("user-1");
		expect(attrs["adk.session_id"]).toBe("sess-1");
	});
});
