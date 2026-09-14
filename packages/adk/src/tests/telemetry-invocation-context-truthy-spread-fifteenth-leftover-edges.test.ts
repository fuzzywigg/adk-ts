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
 * Fifteenth leftover: `...(invocationContext && { session.id, user.id })`.
 * Falsy context omits attrs; truthy near-miss without `.session` throws on
 * property access (spread gate is truthiness only).
 */
describe("telemetry invocationContext truthy spread fifteenth leftover edges", () => {
	const tool = { name: "t", description: "d" } as BaseTool;
	const event = {
		invocationId: "inv",
		content: {
			parts: [{ functionResponse: { id: "c1", response: { ok: true } } }],
		},
	} as Event;

	it.each([
		{ label: "undefined", ctx: undefined },
		{ label: "null", ctx: null },
		{ label: "0", ctx: 0 },
		{ label: "false", ctx: false },
		{ label: "empty string", ctx: "" },
	])("omits session/user attrs when invocationContext is falsy ($label)", async ({
		ctx,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, undefined, ctx as any);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs).not.toHaveProperty("session.id");
		expect(attrs).not.toHaveProperty("user.id");
	});

	it.each([
		{ label: "zero string", ctx: "0" },
		{ label: "whitespace", ctx: " " },
		{ label: "empty object", ctx: {} },
	])("truthy near-miss $label enters spread and throws on missing session", async ({
		ctx,
	}) => {
		await withActiveSpan();
		const service = new TelemetryService();
		expect(() =>
			service.traceToolCall(tool, {}, event, undefined, ctx as any),
		).toThrow();
	});

	it("keeps real session/user ids when context is a normal object", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, undefined, {
			session: { id: "sess-1" },
			userId: "user-1",
		} as any);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["session.id"]).toBe("sess-1");
		expect(attrs["user.id"]).toBe("user-1");
	});
});
