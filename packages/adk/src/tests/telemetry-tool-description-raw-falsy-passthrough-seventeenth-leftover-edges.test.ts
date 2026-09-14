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
 * Seventeenth leftover: `gen_ai.tool.description: tool.description` has no
 * `|| ""` coalesce — falsy values pass through as span attrs. Distinct from
 * #219 AI SDK vs providers declaration description edges.
 */
describe("telemetry tool description raw falsy passthrough seventeenth leftover edges", () => {
	const event = {
		invocationId: "inv",
		content: {
			parts: [{ functionResponse: { id: "c1", response: { ok: true } } }],
		},
	} as Event;

	it.each([
		{ label: "undefined", description: undefined },
		{ label: "null", description: null },
		{ label: "0", description: 0 },
		{ label: "false", description: false },
		{ label: "empty", description: "" },
	])("falsy description ($label) set as-is on span", async ({
		description,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall({ name: "t", description } as BaseTool, {}, event);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.description"]).toBe(
			description,
		);
	});

	it.each([
		{ label: "zero string", description: "0" },
		{ label: "whitespace", description: " " },
		{ label: "false string", description: "false" },
	])("truthy description ($label) kept", async ({ description }) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall({ name: "t", description } as BaseTool, {}, event);
		expect(setAttributes.mock.calls[0][0]["gen_ai.tool.description"]).toBe(
			description,
		);
	});
});
