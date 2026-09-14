import { afterEach, describe, expect, it, vi } from "vitest";
import { Event } from "../events/event";
import type { InvocationContext } from "../agents/invocation-context";
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
		invocationId: "inv-node-env",
		session: { id: "ses-1" },
		userId: "u-1",
	} as unknown as InvocationContext;
}

/**
 * Eleventh leftover: ...(process.env.NODE_ENV && { deployment... }) —
 * unset is covered; empty-string / other falsy arms omit the attribute.
 */
describe("telemetry NODE_ENV empty-string falsy eleventh leftover", () => {
	const tool = { name: "t", description: "d" } as BaseTool;

	it.each([
		{ label: "empty string", value: "" },
		{ label: "undefined via delete", value: undefined },
	])("traceToolCall omits deployment env when NODE_ENV is $label", async ({
		value,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		if (value === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = value;
		}
		try {
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
									id: "c1",
									name: "t",
									response: {},
								},
							},
						],
					},
				}),
			);
			const attrs = setAttributes.mock.calls[0][0];
			expect(attrs).not.toHaveProperty("deployment.environment.name");
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});

	it("traceLlmCall omits deployment env when NODE_ENV is empty string", async () => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = "";
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
			const attrs = setAttributes.mock.calls[0][0];
			expect(attrs).not.toHaveProperty("deployment.environment.name");
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});

	it("traceToolCall sets deployment env when NODE_ENV is truthy", async () => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = "staging";
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
			expect(
				setAttributes.mock.calls[0][0]["deployment.environment.name"],
			).toBe("staging");
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});

	it.each([
		{ label: "single space", value: " " },
		{ label: "tabs", value: "\t" },
		{ label: "zero string", value: "0" },
		{ label: "false string", value: "false" },
	])("traceToolCall keeps deployment env when NODE_ENV is truthy $label", async ({
		value,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = value;
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
			expect(
				setAttributes.mock.calls[0][0]["deployment.environment.name"],
			).toBe(value);
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});

	it("traceLlmCall keeps whitespace NODE_ENV (truthy && spread, unlike empty string)", async () => {
		const { setAttributes } = await withActiveSpan();
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = " ";
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
			).toBe(" ");
		} finally {
			if (prev === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prev;
		}
	});
});
