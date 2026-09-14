import { describe, expect, it, vi } from "vitest";
import {
	createSamplingHandler,
	McpSamplingHandler,
} from "../../../tools/mcp/sampling-handler";
import {
	McpErrorType,
	type McpSamplingRequest,
	type SamplingHandler,
} from "../../../tools/mcp/types";

function textRequest(
	overrides: Partial<McpSamplingRequest["params"]> = {},
): McpSamplingRequest {
	return {
		method: "sampling/createMessage",
		params: {
			messages: [{ role: "user", content: { type: "text", text: "hello" } }],
			maxTokens: 64,
			...overrides,
		},
	};
}

describe("McpSamplingHandler leftover: safeText(mimeType) || image/audio defaults", () => {
	const imageData = Buffer.from("img-bytes").toString("base64");
	const audioData = Buffer.from("aud-bytes").toString("base64");

	const emptyishMime: unknown[] = [
		"",
		null,
		undefined,
		0,
		false,
		{},
		[],
		42,
		true,
		{ type: "image/png" },
	];

	for (const mimeType of emptyishMime) {
		it(`image defaults to image/jpeg when mimeType is ${JSON.stringify(mimeType)}`, () => {
			const handler = new McpSamplingHandler(async () => "ok");
			const parts = (handler as any).convertMcpContentToADKParts({
				type: "image",
				data: imageData,
				mimeType,
			});
			expect(parts).toEqual([
				{
					inlineData: {
						data: imageData,
						mimeType: "image/jpeg",
					},
				},
			]);
		});
	}

	for (const mimeType of emptyishMime) {
		it(`audio defaults to audio/mpeg when mimeType is ${JSON.stringify(mimeType)}`, () => {
			const handler = new McpSamplingHandler(async () => "ok");
			const parts = (handler as any).convertMcpContentToADKParts({
				type: "audio",
				data: audioData,
				mimeType,
			});
			expect(parts).toEqual([
				{
					inlineData: {
						data: audioData,
						mimeType: "audio/mpeg",
					},
				},
			]);
		});
	}

	it("omitted mimeType on image uses image/jpeg", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const parts = (handler as any).convertMcpContentToADKParts({
			type: "image",
			data: imageData,
		});
		expect(parts[0].inlineData.mimeType).toBe("image/jpeg");
	});

	it("omitted mimeType on audio uses audio/mpeg", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const parts = (handler as any).convertMcpContentToADKParts({
			type: "audio",
			data: audioData,
		});
		expect(parts[0].inlineData.mimeType).toBe("audio/mpeg");
	});

	const truthyMimePairs = [
		{ type: "image" as const, mimeType: "image/png", expected: "image/png" },
		{ type: "image" as const, mimeType: "image/webp", expected: "image/webp" },
		{ type: "image" as const, mimeType: "image/gif", expected: "image/gif" },
		{ type: "audio" as const, mimeType: "audio/wav", expected: "audio/wav" },
		{ type: "audio" as const, mimeType: "audio/ogg", expected: "audio/ogg" },
		{ type: "audio" as const, mimeType: "audio/mp3", expected: "audio/mp3" },
	];

	for (const { type, mimeType, expected } of truthyMimePairs) {
		it(`keeps explicit ${mimeType} for ${type}`, () => {
			const handler = new McpSamplingHandler(async () => "ok");
			const data = type === "image" ? imageData : audioData;
			const parts = (handler as any).convertMcpContentToADKParts({
				type,
				data,
				mimeType,
			});
			expect(parts[0].inlineData.mimeType).toBe(expected);
		});
	}

	it("empty mimeType with optional text still defaults image/jpeg", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const parts = (handler as any).convertMcpContentToADKParts({
			type: "image",
			text: "caption",
			data: imageData,
			mimeType: "",
		});
		expect(parts).toEqual([
			{ text: "caption" },
			{
				inlineData: {
					data: imageData,
					mimeType: "image/jpeg",
				},
			},
		]);
	});

	it("null mimeType with optional text still defaults audio/mpeg", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const parts = (handler as any).convertMcpContentToADKParts({
			type: "audio",
			text: "note",
			data: audioData,
			mimeType: null,
		});
		expect(parts).toEqual([
			{ text: "note" },
			{
				inlineData: {
					data: audioData,
					mimeType: "audio/mpeg",
				},
			},
		]);
	});
});

describe("McpSamplingHandler leftover: mimeType defaults through full request path", () => {
	const imageData = Buffer.from("full-img").toString("base64");
	const audioData = Buffer.from("full-aud").toString("base64");

	const requestCases: Array<{
		label: string;
		content: Record<string, unknown>;
		expectedMime: string;
	}> = [
		{
			label: "image empty mimeType",
			content: { type: "image", data: imageData, mimeType: "" },
			expectedMime: "image/jpeg",
		},
		{
			label: "audio empty mimeType",
			content: { type: "audio", data: audioData, mimeType: "" },
			expectedMime: "audio/mpeg",
		},
		{
			label: "image empty mimeType with text caption",
			content: {
				type: "image",
				data: imageData,
				mimeType: "",
				text: "cap",
			},
			expectedMime: "image/jpeg",
		},
		{
			label: "audio empty mimeType with text caption",
			content: {
				type: "audio",
				data: audioData,
				mimeType: "",
				text: "note",
			},
			expectedMime: "audio/mpeg",
		},
	];

	for (const { label, content, expectedMime } of requestCases) {
		it(`end-to-end ${label}`, async () => {
			const samplingHandler = vi.fn(async (request) => {
				const parts = request.contents.flatMap((c: any) => c.parts ?? []);
				const inline = parts.find((p: any) => p.inlineData);
				expect(inline.inlineData.mimeType).toBe(expectedMime);
				return "ok";
			}) as SamplingHandler;

			const handler = new McpSamplingHandler(samplingHandler);
			await handler.handleSamplingRequest({
				method: "sampling/createMessage",
				params: {
					maxTokens: 16,
					messages: [
						{
							role: "user",
							content: content as any,
						},
					],
				},
			});
			expect(samplingHandler).toHaveBeenCalledOnce();
		});
	}

	it("array content with empty mimeTypes defaults per entry", async () => {
		const samplingHandler = vi.fn(async (request) => {
			const parts = request.contents.flatMap((c: any) => c.parts ?? []);
			const mimes = parts
				.filter((p: any) => p.inlineData)
				.map((p: any) => p.inlineData.mimeType);
			expect(mimes).toEqual(["image/jpeg", "audio/mpeg"]);
			return "ok";
		}) as SamplingHandler;

		const handler = new McpSamplingHandler(samplingHandler);
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				maxTokens: 16,
				messages: [
					{
						role: "user",
						content: [
							{ type: "image", data: imageData, mimeType: "" },
							{ type: "audio", data: audioData, mimeType: "" },
						],
					},
				],
			},
		});
		expect(samplingHandler).toHaveBeenCalledOnce();
	});

	it("mixed explicit and empty mimeTypes in one request", async () => {
		const samplingHandler = vi.fn(async (request) => {
			const parts = request.contents.flatMap((c: any) => c.parts ?? []);
			const mimes = parts
				.filter((p: any) => p.inlineData)
				.map((p: any) => p.inlineData.mimeType);
			expect(mimes).toEqual([
				"image/png",
				"image/jpeg",
				"audio/wav",
				"audio/mpeg",
			]);
			return "ok";
		}) as SamplingHandler;

		const handler = new McpSamplingHandler(samplingHandler);
		await handler.handleSamplingRequest({
			method: "sampling/createMessage",
			params: {
				maxTokens: 32,
				messages: [
					{
						role: "user",
						content: {
							type: "image",
							data: imageData,
							mimeType: "image/png",
						},
					},
					{
						role: "user",
						content: { type: "image", data: imageData, mimeType: "" },
					},
					{
						role: "user",
						content: {
							type: "audio",
							data: audioData,
							mimeType: "audio/wav",
						},
					},
					{
						role: "user",
						content: { type: "audio", data: audioData, mimeType: "" },
					},
				],
			},
		});
		expect(samplingHandler).toHaveBeenCalledOnce();
	});
});

describe("McpSamplingHandler leftover: safeText on related media fields", () => {
	it("non-string image text is ignored while empty mimeType defaults", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const parts = (handler as any).convertMcpContentToADKParts({
			type: "image",
			text: 123,
			data: Buffer.from("x").toString("base64"),
			mimeType: "",
		});
		expect(parts).toHaveLength(1);
		expect(parts[0].inlineData.mimeType).toBe("image/jpeg");
	});

	it("whitespace mimeType string is kept (truthy safeText)", () => {
		const handler = new McpSamplingHandler(async () => "ok");
		const parts = (handler as any).convertMcpContentToADKParts({
			type: "image",
			data: Buffer.from("x").toString("base64"),
			mimeType: " ",
		});
		expect(parts[0].inlineData.mimeType).toBe(" ");
	});

	it("createSamplingHandler identity still holds beside mime defaults", async () => {
		const fn = async () => "x";
		expect(createSamplingHandler(fn)).toBe(fn);
		const handler = new McpSamplingHandler(fn);
		await expect(
			handler.handleSamplingRequest(textRequest()),
		).resolves.toMatchObject({
			content: { type: "text", text: "x" },
		});
	});

	it("rejects invalid method unrelated to mime defaults", async () => {
		const handler = new McpSamplingHandler(async () => "ok");
		await expect(
			handler.handleSamplingRequest({
				method: "tools/call",
				params: {
					messages: [{ role: "user", content: { type: "text", text: "x" } }],
					maxTokens: 1,
				},
			} as McpSamplingRequest),
		).rejects.toMatchObject({
			type: McpErrorType.INVALID_REQUEST_ERROR,
		});
	});
});
