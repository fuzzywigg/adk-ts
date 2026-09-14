import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import { TelemetryService } from "../telemetry";

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

const tool = { name: "t", description: "d" } as any;
const event = {
	invocationId: "evt",
	content: {
		parts: [{ functionResponse: { id: "id1", response: { ok: true } } }],
	},
} as any;

/**
 * Residual: traceToolCall llmRequest ? build : "{}" and
 * ...(invocationContext && { session/user }) falsy matrices.
 */
describe("telemetry tool-call llmRequest/invocation falsy residual leftover edges", () => {
	it.each([
		{ label: "omitted", llmRequest: Symbol.for("omit") },
		{ label: "undefined", llmRequest: undefined },
		{ label: "null", llmRequest: null },
		{ label: "0", llmRequest: 0 },
		{ label: "false", llmRequest: false },
		{ label: "empty string", llmRequest: "" },
	])("traceToolCall adk.llm_request is '{}' when llmRequest is $label", async ({
		llmRequest,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		if (llmRequest === Symbol.for("omit")) {
			service.traceToolCall(tool, { a: 1 }, event);
		} else {
			service.traceToolCall(tool, { a: 1 }, event, llmRequest as any);
		}
		expect(setAttributes.mock.calls[0][0]["adk.llm_request"]).toBe("{}");
	});

	it("truthy empty-object llmRequest still builds (not '{}')", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, { a: 1 }, event, {
			model: "m",
			config: {},
			contents: [],
		} as LlmRequest);
		const raw = setAttributes.mock.calls[0][0]["adk.llm_request"];
		expect(raw).not.toBe("{}");
		expect(JSON.parse(raw)).toMatchObject({
			model: "m",
			contents: [],
		});
	});

	it.each([
		{ label: "omitted", invocationContext: Symbol.for("omit") },
		{ label: "undefined", invocationContext: undefined },
		{ label: "null", invocationContext: null },
		{ label: "0", invocationContext: 0 },
		{ label: "false", invocationContext: false },
		{ label: "empty string", invocationContext: "" },
	])("traceToolCall omits session/user when invocationContext is $label", async ({
		invocationContext,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		if (invocationContext === Symbol.for("omit")) {
			service.traceToolCall(tool, {}, event, undefined);
		} else {
			service.traceToolCall(
				tool,
				{},
				event,
				undefined,
				invocationContext as any,
			);
		}
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs).not.toHaveProperty("session.id");
		expect(attrs).not.toHaveProperty("user.id");
	});

	it("truthy invocationContext sets session.id and user.id", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceToolCall(tool, {}, event, undefined, {
			userId: "u1",
			session: { id: "s1" },
		} as any);
		const attrs = setAttributes.mock.calls[0][0];
		expect(attrs["session.id"]).toBe("s1");
		expect(attrs["user.id"]).toBe("u1");
	});
});
