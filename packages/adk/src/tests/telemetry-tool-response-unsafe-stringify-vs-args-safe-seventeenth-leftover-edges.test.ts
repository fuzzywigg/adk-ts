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
 * Seventeenth leftover: `JSON.stringify(functionResponse.response)` is raw /
 * uncaught, while `adk.tool_call_args` uses `_safeJsonStringify`. Prior
 * leftovers only pinned falsy `||` coalesce and the private helper itself.
 */
describe("telemetry tool-response unsafe stringify vs args safe seventeenth leftover edges", () => {
	const tool = { name: "lookup", description: "d" } as BaseTool;

	it.each([
		{
			label: "circular",
			make: () => {
				const circular: any = { ok: true };
				circular.self = circular;
				return circular;
			},
		},
		{
			label: "bigint",
			make: () => ({ n: 1n }),
		},
	])("traceToolCall throws when functionResponse.response is $label", async ({
		make,
	}) => {
		await withActiveSpan();
		const service = new TelemetryService();
		expect(() =>
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
									id: "c1",
									name: "lookup",
									response: make(),
								},
							},
						],
					},
				}),
			),
		).toThrow();
	});

	it.each([
		{
			label: "circular",
			make: () => {
				const circular: any = { q: "hi" };
				circular.self = circular;
				return circular;
			},
		},
		{
			label: "bigint",
			make: () => ({ n: 2n }),
		},
	])("same-shaped $label args stay safe via _safeJsonStringify", async ({
		make,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(
			tool,
			make(),
			new Event({
				author: "tool",
				invocationId: "inv",
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
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["adk.tool_call_args"]).toBe("<not serializable>");
		expect(JSON.parse(attrs["adk.tool_response"])).toBe('{"ok":true}');
	});

	it("plain object response still double-encodes (control)", async () => {
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
								id: "c3",
								name: "lookup",
								response: { ok: true },
							},
						},
					],
				},
			}),
		);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["adk.tool_call_args"]).toBe('{"q":1}');
		expect(JSON.parse(attrs["adk.tool_response"])).toBe('{"ok":true}');
	});
});
