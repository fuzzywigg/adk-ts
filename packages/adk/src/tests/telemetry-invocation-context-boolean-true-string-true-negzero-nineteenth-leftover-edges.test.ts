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
 * Nineteenth leftover (HEAVY tip-relaunch residual after tip #260 / #261; lands closed #252):
 * `...(invocationContext && { session.id, user.id })`. Fifteenth pinned
 * classic falsy omit + `"0"` / whitespace / `{}` throw. Residual boolean
 * `true` / `"true"` / `[]` / `-Infinity` enter the spread and throw;
 * SameValueZero `-0` stays falsy and omits attrs.
 */
describe("telemetry invocationContext boolean-true/string-true/negzero nineteenth leftover edges", () => {
	const tool = { name: "t", description: "d" } as BaseTool;
	const event = {
		invocationId: "inv",
		content: {
			parts: [{ functionResponse: { id: "c1", response: { ok: true } } }],
		},
	} as Event;

	it("SameValueZero -0 invocationContext omits session/user attrs", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, undefined, -0 as any);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs).not.toHaveProperty("session.id");
		expect(attrs).not.toHaveProperty("user.id");
	});

	it.each([
		{ label: "boolean true", ctx: true },
		{ label: "string true", ctx: "true" },
		{ label: "empty array", ctx: [] },
		{ label: "NEGATIVE_INFINITY", ctx: Number.NEGATIVE_INFINITY },
	])("truthy near-miss $label enters spread and throws on missing session", async ({
		ctx,
	}) => {
		await withActiveSpan();
		const service = new TelemetryService();
		expect(() =>
			service.traceToolCall(tool, {}, event, undefined, ctx as any),
		).toThrow();
	});
});
