import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../agents/invocation-context";
import { Event } from "../events/event";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
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

function mockInvocation(): InvocationContext {
	return {
		invocationId: "inv-node-env-nineteenth",
		session: { id: "ses-1" },
		userId: "u-1",
	} as unknown as InvocationContext;
}

/**
 * Nineteenth leftover (complement #252 after tip #251):
 * `...(process.env.NODE_ENV && { deployment... })`. Eleventh pinned empty /
 * whitespace/`"0"`/`"false"`. Residual: env assignment stringifies first —
 * boolean `true` → `"true"` keep; `[]` → `""` omit; `-0` → `"0"` keep;
 * `-Infinity` → `"-Infinity"` keep.
 */
describe("telemetry NODE_ENV boolean-true/string-true/negzero nineteenth leftover edges", () => {
	const tool = { name: "t", description: "d" } as BaseTool;

	it.each([
		{
			label: "boolean true → string true",
			assign: true as any,
			expected: "true",
			kept: true,
		},
		{
			label: "string true",
			assign: "true",
			expected: "true",
			kept: true,
		},
		{
			label: "empty array → empty string",
			assign: [] as any,
			expected: undefined,
			kept: false,
		},
		{
			label: "-0 → string 0",
			assign: -0 as any,
			expected: "0",
			kept: true,
		},
		{
			label: "NEGATIVE_INFINITY",
			assign: Number.NEGATIVE_INFINITY as any,
			expected: "-Infinity",
			kept: true,
		},
	])("traceToolCall NODE_ENV $label", async ({ assign, expected, kept }) => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = assign;
		try {
			const service = new TelemetryService();
			service.traceToolCall(
				tool,
				{},
				new Event({
					author: "tool",
					content: {
						parts: [
							{ functionResponse: { id: "c1", name: "t", response: {} } },
						],
					},
				}),
			);
			const attrs = setAttributes.mock.calls[0][0];
			if (kept) {
				expect(attrs["deployment.environment.name"]).toBe(expected);
			} else {
				expect(attrs).not.toHaveProperty("deployment.environment.name");
			}
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});

	it('traceLlmCall keeps stringified boolean-true NODE_ENV as "true"', async () => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = true as any;
		try {
			const service = new TelemetryService();
			service.traceLlmCall(
				mockInvocation(),
				"evt-1",
				{
					model: "m",
					config: {},
					contents: [],
				} as LlmRequest,
				{} as LlmResponse,
			);
			expect(
				setAttributes.mock.calls[0][0]["deployment.environment.name"],
			).toBe("true");
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});
});
