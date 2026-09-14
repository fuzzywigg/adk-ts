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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip 96457a9 / #248):
 * `functionResponse.id || "<not specified>"` after eighteenth true/`"true"`/
 * `[]`/`-Infinity`/`-0`. `NaN` → sentinel; `POSITIVE_INFINITY` stays.
 */
describe("telemetry tool-call-id nan posinf nineteenth leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it("NaN coalesces to sentinel via ||", async () => {
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
						{
							functionResponse: {
								id: Number.NaN as any,
								name: "lookup",
								response: {},
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

	it("POSITIVE_INFINITY id stays", async () => {
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
								id: Number.POSITIVE_INFINITY as any,
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.call.id"]).toBe(
			Number.POSITIVE_INFINITY,
		);
	});
});
