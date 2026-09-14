import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequest } from "../models/llm-request";
import type { LlmResponse } from "../models/llm-response";
import { TelemetryService, traceLlmCall } from "../telemetry";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("telemetry leftover contents || [] edges", () => {
	async function withActiveSpan() {
		const setAttributes = vi.fn();
		const addEvent = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent,
		} as any);
		return { setAttributes, addEvent };
	}

	const invocation = {
		invocationId: "inv-leftover",
		userId: "user-leftover",
		session: { id: "sess-leftover" },
	} as any;

	const response = {
		content: { role: "model", parts: [{ text: "out" }] },
		usageMetadata: {
			promptTokenCount: 1,
			candidatesTokenCount: 1,
		},
	} as LlmResponse;

	const missingContentsCases: Array<{
		label: string;
		buildRequest: () => any;
	}> = [
		{
			label: "omitted contents field",
			buildRequest: () => ({
				model: "gemini-2.5-flash",
				config: { temperature: 0.1 },
			}),
		},
		{
			label: "contents undefined",
			buildRequest: () => ({
				model: "gemini-2.5-flash",
				config: { temperature: 0.2 },
				contents: undefined,
			}),
		},
		{
			label: "contents null",
			buildRequest: () => ({
				model: "m",
				config: { topP: 0.5 },
				contents: null,
			}),
		},
		{
			label: "contents empty string",
			buildRequest: () => ({
				model: "m",
				config: { topP: 0.4 },
				contents: "",
			}),
		},
		{
			label: "contents 0",
			buildRequest: () => ({
				model: "m",
				config: { topP: 0.3 },
				contents: 0,
			}),
		},
		{
			label: "contents false",
			buildRequest: () => ({
				model: "m",
				config: { topP: 0.2 },
				contents: false,
			}),
		},
	];

	for (const { label, buildRequest } of missingContentsCases) {
		it(`traceLlmCall coalesces ${label} without throwing`, async () => {
			const { setAttributes, addEvent } = await withActiveSpan();
			const service = new TelemetryService();

			expect(() =>
				service.traceLlmCall(
					invocation,
					"evt-1",
					buildRequest() as LlmRequest,
					response,
				),
			).not.toThrow();

			const attrs = setAttributes.mock.calls[0][0];
			const request = JSON.parse(attrs["adk.llm_request"]);
			expect(request.contents).toEqual([]);
			expect(addEvent).toHaveBeenCalledWith(
				"gen_ai.content.prompt",
				expect.any(Object),
			);
		});
	}

	it("filters inlineData parts while keeping textual contents", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();

		service.traceLlmCall(
			invocation,
			"evt-2",
			{
				model: "m",
				config: { maxOutputTokens: 10 },
				contents: [
					{
						role: "user",
						parts: [
							{ text: "hello" },
							{ inlineData: { mimeType: "image/png", data: "abc" } },
						],
					},
					{
						role: "model",
						parts: [{ text: "world" }, { inlineData: { data: "xyz" } }],
					},
				],
			} as LlmRequest,
			response,
		);

		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.contents).toEqual([
			{ role: "user", parts: [{ text: "hello" }] },
			{ role: "model", parts: [{ text: "world" }] },
		]);
	});

	const configExclusionCases = [
		{
			label: "strips response_schema and nulls",
			config: {
				temperature: 0.3,
				response_schema: { type: "object" },
				nullableField: null,
				keep: "yes",
			},
			assert: (cfg: any) => {
				expect(cfg.response_schema).toBeUndefined();
				expect(cfg.nullableField).toBeUndefined();
				expect(cfg.keep).toBe("yes");
				expect(cfg.temperature).toBe(0.3);
			},
		},
		{
			label: "maps functions without handlers",
			config: {
				functions: [
					{
						name: "fn",
						description: "d",
						parameters: { type: "object" },
						handler: () => {},
					},
				],
			},
			assert: (cfg: any) => {
				expect(cfg.functions).toEqual([
					{
						name: "fn",
						description: "d",
						parameters: { type: "object" },
					},
				]);
			},
		},
		{
			label: "empty config with omitted contents",
			config: {},
			assert: (cfg: any) => {
				expect(cfg).toEqual({});
			},
		},
	];

	for (const { label, config, assert } of configExclusionCases) {
		it(`config exclusion matrix: ${label}`, async () => {
			const { setAttributes } = await withActiveSpan();
			const service = new TelemetryService();
			const prev = process.env.NODE_ENV;
			process.env.NODE_ENV = "test";

			service.traceLlmCall(
				invocation,
				"evt-cfg",
				{
					model: "m",
					config,
				} as LlmRequest,
				{ content: { role: "model", parts: [] } } as LlmResponse,
			);

			const request = JSON.parse(
				setAttributes.mock.calls[0][0]["adk.llm_request"],
			);
			expect(request.contents).toEqual([]);
			assert(request.config);
			process.env.NODE_ENV = prev;
		});
	}

	it("module-level traceLlmCall forwards omitted contents", async () => {
		const setAttributes = vi.fn();
		const { trace } = await import("@opentelemetry/api");
		vi.spyOn(trace, "getActiveSpan").mockReturnValue({
			setAttributes,
			addEvent: vi.fn(),
		} as any);

		traceLlmCall(
			invocation,
			"evt-mod",
			{ model: "x", config: { temperature: 0 } } as LlmRequest,
			response,
		);

		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.contents).toEqual([]);
	});

	it.each([
		{ label: "empty string", contents: "" },
		{ label: "0", contents: 0 },
		{ label: "false", contents: false },
	])("traceLlmCall coalesces falsy contents ($label) via || []", async ({
		contents,
	}) => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();
		service.traceLlmCall(
			invocation,
			"evt-falsy-contents",
			{
				model: "m",
				config: {},
				contents,
			} as LlmRequest,
			response,
		);
		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.contents).toEqual([]);
	});

	it("contents with missing parts become empty parts arrays", async () => {
		const { setAttributes } = await withActiveSpan();
		const service = new TelemetryService();

		service.traceLlmCall(
			invocation,
			"evt-parts",
			{
				model: "m",
				config: {},
				contents: [{ role: "user" }, { role: "model", parts: undefined }],
			} as LlmRequest,
			response,
		);

		const request = JSON.parse(
			setAttributes.mock.calls[0][0]["adk.llm_request"],
		);
		expect(request.contents).toEqual([
			{ role: "user", parts: [] },
			{ role: "model", parts: [] },
		]);
	});
});
