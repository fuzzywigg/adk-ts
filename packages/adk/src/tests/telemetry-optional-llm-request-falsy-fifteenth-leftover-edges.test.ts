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
 * Fifteenth leftover: `llmRequest ? build : "{}"` — telemetry.test.ts pins
 * omitted/undefined; residual falsy matrix and truthy empty object remain.
 */
describe("telemetry optional llmRequest falsy fifteenth leftover edges", () => {
	const tool = { name: "t", description: "d" } as BaseTool;
	const event = {
		invocationId: "inv",
		content: {
			parts: [{ functionResponse: { id: "c1", response: { ok: true } } }],
		},
	} as Event;

	it.each([
		{ label: "null", llmRequest: null },
		{ label: "0", llmRequest: 0 },
		{ label: "false", llmRequest: false },
		{ label: "empty string", llmRequest: "" },
	])('falsy llmRequest ($label) → adk.llm_request "{}"', async ({
		llmRequest,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, llmRequest as any);
		expect(setAttributes.mock.calls[0][0]["adk.llm_request"]).toBe("{}");
	});

	it("truthy empty object still builds a request trace payload", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, {
			model: "m",
			config: {},
			contents: [],
		} as any);
		const payload = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(payload).toEqual({
			model: "m",
			config: {},
			contents: [],
		});
	});
});
