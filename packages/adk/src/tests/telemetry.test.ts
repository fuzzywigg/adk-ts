import { describe, expect, it, vi } from "vitest";
import { Event } from "../events/event";
import { LlmRequest } from "../models/llm-request";
import { LlmResponse } from "../models/llm-response";
import { TelemetryService } from "../telemetry";
import type { BaseTool } from "../tools/base/base-tool";
import type { InvocationContext } from "../agents/invocation-context";

describe("TelemetryService", () => {
	it("starts uninitialized with null config", () => {
		const service = new TelemetryService();
		expect(service.initialized).toBe(false);
		expect(service.getConfig()).toBeNull();
		expect(service.getTracer()).toBeDefined();
	});

	it("traceToolCall and traceLlmCall no-op without an active span", () => {
		const service = new TelemetryService();
		const tool = {
			name: "search",
			description: "search tool",
		} as BaseTool;
		const event = new Event({
			author: "agent",
			invocationId: "inv-1",
			content: {
				role: "user",
				parts: [
					{
						functionResponse: {
							id: "call-1",
							response: { ok: true },
						},
					},
				],
			},
		});
		const context = {
			invocationId: "inv-1",
			userId: "u1",
			session: { id: "s1" },
		} as unknown as InvocationContext;
		const request = new LlmRequest({
			model: "fake",
			contents: [{ role: "user", parts: [{ text: "hi" }] }],
		});
		const response = new LlmResponse({
			content: { role: "model", parts: [{ text: "yo" }] },
		});

		expect(() =>
			service.traceToolCall(tool, { q: "x" }, event, request, context),
		).not.toThrow();
		expect(() =>
			service.traceLlmCall(context, "evt-1", request, response),
		).not.toThrow();
	});

	it("shutdown warns and returns when not initialized", async () => {
		const service = new TelemetryService();
		await expect(service.shutdown()).resolves.toBeUndefined();
	});

	it("traceAsyncGenerator yields values and ends the span", async () => {
		const end = vi.fn();
		const recordException = vi.fn();
		const setStatus = vi.fn();
		const service = new TelemetryService();
		(service as any).tracer = {
			startSpan: () => ({ end, recordException, setStatus }),
		};

		async function* gen() {
			yield 1;
			yield 2;
		}

		const values: number[] = [];
		for await (const value of service.traceAsyncGenerator("test-span", gen())) {
			values.push(value);
		}

		expect(values).toEqual([1, 2]);
		expect(end).toHaveBeenCalled();
	});

	it("traceAsyncGenerator records exceptions before rethrowing", async () => {
		const end = vi.fn();
		const recordException = vi.fn();
		const setStatus = vi.fn();
		const service = new TelemetryService();
		(service as any).tracer = {
			startSpan: () => ({ end, recordException, setStatus }),
		};

		async function* gen(): AsyncGenerator<number, void, unknown> {
			yield 1;
			throw new Error("generator failed");
		}

		const iter = service.traceAsyncGenerator("boom", gen());
		await expect(iter.next()).resolves.toEqual({ value: 1, done: false });
		await expect(iter.next()).rejects.toThrow("generator failed");
		expect(recordException).toHaveBeenCalled();
		expect(setStatus).toHaveBeenCalled();
		expect(end).toHaveBeenCalled();
	});
});
