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
		invocationId: "inv-node-env-residual",
		session: { id: "ses-1" },
		userId: "u-1",
	} as unknown as InvocationContext;
}

/**
 * Nineteenth leftover residual deepen after tip #282 / 1f70668:
 * `...(process.env.NODE_ENV && { deployment... })` — env assignment
 * ToStrings first: Object(false)→`"false"` keep; Object(0)→`"0"` keep;
 * Object("")→`""` omit; Object(NaN)→`"NaN"` keep; `"-Infinity"` / `-1`
 * keep as strings.
 */
describe("telemetry NODE_ENV object-false/zero/empty nineteenth residual deepen", () => {
	const tool = { name: "t", description: "d" } as BaseTool;

	it.each([
		{
			label: 'Object(false) → "false"',
			assign: Object(false) as any,
			expected: "false",
			kept: true,
		},
		{
			label: 'Object(0) → "0"',
			assign: Object(0) as any,
			expected: "0",
			kept: true,
		},
		{
			label: 'Object("") → empty omit',
			assign: Object("") as any,
			expected: undefined,
			kept: false,
		},
		{
			label: 'Object(NaN) → "NaN"',
			assign: Object(Number.NaN) as any,
			expected: "NaN",
			kept: true,
		},
		{
			label: 'string "-Infinity"',
			assign: "-Infinity",
			expected: "-Infinity",
			kept: true,
		},
		{
			label: "number -1 → string -1",
			assign: -1 as any,
			expected: "-1",
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

	it('traceLlmCall keeps stringified "-Infinity" NODE_ENV', async () => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = "-Infinity";
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
			).toBe("-Infinity");
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});
});
