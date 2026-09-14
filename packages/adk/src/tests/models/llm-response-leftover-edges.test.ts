import { describe, expect, it } from "vitest";
import { LlmResponse } from "../../models/llm-response";

describe("LlmResponse constructor leftover field matrices", () => {
	const boolFields = [
		{ partial: true, turnComplete: false, interrupted: undefined },
		{ partial: false, turnComplete: true, interrupted: false },
		{ partial: undefined, turnComplete: undefined, interrupted: true },
		{ partial: true, turnComplete: true, interrupted: true },
	];

	for (const [i, fields] of boolFields.entries()) {
		it(`bool field combo #${i}`, () => {
			const resp = new LlmResponse(fields);
			expect(resp.partial).toBe(fields.partial);
			expect(resp.turnComplete).toBe(fields.turnComplete);
			expect(resp.interrupted).toBe(fields.interrupted);
		});
	}

	const ids = [undefined, "", "id-1", "resp_42"];
	for (const id of ids) {
		it(`id ${JSON.stringify(id)}`, () => {
			expect(new LlmResponse({ id }).id).toBe(id);
		});
	}

	const texts = [undefined, "", "hi", "multi\nline"];
	for (const text of texts) {
		it(`text ${JSON.stringify(text)}`, () => {
			expect(new LlmResponse({ text }).text).toBe(text);
		});
	}

	const finishReasons = [
		undefined,
		"STOP",
		"MAX_TOKENS",
		"SAFETY",
		"RECITATION",
		"OTHER",
		"",
	];
	for (const finishReason of finishReasons) {
		it(`finishReason ${JSON.stringify(finishReason)}`, () => {
			expect(new LlmResponse({ finishReason }).finishReason).toBe(finishReason);
		});
	}

	const candidateIndexes = [undefined, 0, 1, 2, 99];
	for (const candidateIndex of candidateIndexes) {
		it(`candidateIndex ${String(candidateIndex)}`, () => {
			expect(new LlmResponse({ candidateIndex }).candidateIndex).toBe(
				candidateIndex,
			);
		});
	}

	it("assigns customMetadata and error object", () => {
		const err = new Error("x");
		const customMetadata = { traceId: "t1", tags: ["a"] };
		const resp = new LlmResponse({ customMetadata, error: err });
		expect(resp.customMetadata).toEqual(customMetadata);
		expect(resp.error).toBe(err);
	});

	it("empty constructor leaves fields undefined", () => {
		const resp = new LlmResponse();
		expect(resp.content).toBeUndefined();
		expect(resp.errorCode).toBeUndefined();
		expect(resp.usageMetadata).toBeUndefined();
		expect(resp.groundingMetadata).toBeUndefined();
	});
});

describe("LlmResponse.create usage metadata matrices", () => {
	const usageVariants = [
		undefined,
		{},
		{ totalTokens: 0 },
		{ totalTokens: 10, promptTokenCount: 4, candidatesTokenCount: 6 },
		{ promptTokenCount: 1 },
		{ candidatesTokenCount: 2, totalTokenCount: 3 } as any,
	];

	for (const [i, usageMetadata] of usageVariants.entries()) {
		it(`success candidate preserves usage #${i}`, () => {
			const resp = LlmResponse.create({
				candidates: [{ content: { parts: [{ text: "ok" }] } }],
				usageMetadata: usageMetadata as any,
			});
			expect(resp.content).toEqual({ parts: [{ text: "ok" }] });
			expect(resp.usageMetadata).toEqual(usageMetadata);
			expect(resp.errorCode).toBeUndefined();
		});
	}

	for (const [i, usageMetadata] of usageVariants.entries()) {
		it(`finishReason error preserves usage #${i}`, () => {
			const resp = LlmResponse.create({
				candidates: [{ finishReason: "SAFETY", finishMessage: "blocked" }],
				usageMetadata: usageMetadata as any,
			});
			expect(resp.errorCode).toBe("SAFETY");
			expect(resp.errorMessage).toBe("blocked");
			expect(resp.usageMetadata).toEqual(usageMetadata);
		});
	}

	for (const [i, usageMetadata] of usageVariants.entries()) {
		it(`promptFeedback preserves usage #${i}`, () => {
			const resp = LlmResponse.create({
				promptFeedback: {
					blockReason: "OTHER",
					blockReasonMessage: "nope",
				},
				usageMetadata: usageMetadata as any,
			});
			expect(resp.errorCode).toBe("OTHER");
			expect(resp.usageMetadata).toEqual(usageMetadata);
		});
	}

	for (const [i, usageMetadata] of usageVariants.entries()) {
		it(`UNKNOWN_ERROR preserves usage #${i}`, () => {
			const resp = LlmResponse.create({
				usageMetadata: usageMetadata as any,
			});
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toBe("Unknown error.");
			expect(resp.usageMetadata).toEqual(usageMetadata);
		});
	}
});

describe("LlmResponse.create finishReason / candidate matrices", () => {
	const finishCases = [
		{ finishReason: "STOP", finishMessage: "done" },
		{ finishReason: "MAX_TOKENS", finishMessage: "trunc" },
		{ finishReason: "SAFETY", finishMessage: undefined },
		{ finishReason: undefined, finishMessage: "msg only" },
		{ finishReason: "", finishMessage: "" },
	];

	for (const [i, c] of finishCases.entries()) {
		it(`candidate without parts finish combo #${i}`, () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						finishReason: c.finishReason,
						finishMessage: c.finishMessage,
					},
				],
			});
			expect(resp.errorCode).toBe(c.finishReason);
			expect(resp.errorMessage).toBe(c.finishMessage);
			expect(resp.content).toBeUndefined();
		});
	}

	it("content with null parts is treated as missing parts", () => {
		const resp = LlmResponse.create({
			candidates: [
				{
					content: { role: "model", parts: null as any },
					finishReason: "OTHER",
					finishMessage: "null parts",
				},
			],
		});
		expect(resp.errorCode).toBe("OTHER");
		expect(resp.errorMessage).toBe("null parts");
	});

	it("ignores later candidates when first has content.parts", () => {
		const resp = LlmResponse.create({
			candidates: [
				{ content: { parts: [{ text: "first" }] } },
				{
					finishReason: "STOP",
					finishMessage: "ignored",
				},
			],
		});
		expect(resp.content).toEqual({ parts: [{ text: "first" }] });
		expect(resp.errorCode).toBeUndefined();
	});

	it("first candidate without parts wins even if later has content", () => {
		const resp = LlmResponse.create({
			candidates: [
				{ finishReason: "SAFETY", finishMessage: "first wins" },
				{ content: { parts: [{ text: "later" }] } },
			],
		});
		expect(resp.errorCode).toBe("SAFETY");
		expect(resp.content).toBeUndefined();
	});

	it("groundingMetadata only copied on success path", () => {
		const groundingMetadata = { webSearchQueries: ["q"] } as any;
		const ok = LlmResponse.create({
			candidates: [
				{
					content: { parts: [{ text: "g" }] },
					groundingMetadata,
				},
			],
		});
		expect(ok.groundingMetadata).toBe(groundingMetadata);

		const err = LlmResponse.create({
			candidates: [
				{
					finishReason: "STOP",
					groundingMetadata,
				},
			],
		});
		expect(err.groundingMetadata).toBeUndefined();
	});

	const feedbackCases = [
		{ blockReason: "BLOCKLIST", blockReasonMessage: "blocked" },
		{ blockReason: "SAFETY", blockReasonMessage: undefined },
		{ blockReason: undefined, blockReasonMessage: "only msg" },
		{ blockReason: "", blockReasonMessage: "" },
	];

	for (const [i, fb] of feedbackCases.entries()) {
		it(`promptFeedback combo #${i}`, () => {
			const resp = LlmResponse.create({ promptFeedback: fb });
			expect(resp.errorCode).toBe(fb.blockReason);
			expect(resp.errorMessage).toBe(fb.blockReasonMessage);
		});
	}

	it("empty object response becomes UNKNOWN_ERROR", () => {
		const resp = LlmResponse.create({});
		expect(resp.errorCode).toBe("UNKNOWN_ERROR");
		expect(resp.errorMessage).toBe("Unknown error.");
	});
});

describe("LlmResponse.fromError leftover matrices", () => {
	const nonErrors = [
		"string boom",
		42,
		true,
		null,
		undefined,
		{ message: "obj" },
		["arr"],
	];

	for (const [i, value] of nonErrors.entries()) {
		it(`stringifies non-Error #${i}`, () => {
			const resp = LlmResponse.fromError(value);
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toContain("model unknown");
			expect(resp.error).toBeInstanceOf(Error);
			expect(resp.finishReason).toBe("STOP");
			expect(resp.content?.role).toBe("model");
			expect(resp.content?.parts?.[0]?.text).toContain("Error:");
		});
	}

	const models = [undefined, "", "gpt-4o", "gemini-2.0-flash", "claude"];
	for (const model of models) {
		it(`model option ${JSON.stringify(model)}`, () => {
			const resp = LlmResponse.fromError(new Error("e"), { model });
			const expectedModel = model || "unknown";
			expect(resp.errorMessage).toContain(`model ${expectedModel}`);
		});
	}

	const codes = [undefined, "RATE_LIMIT", "TIMEOUT", "", "UNKNOWN_ERROR"];
	for (const errorCode of codes) {
		it(`errorCode option ${JSON.stringify(errorCode)}`, () => {
			const resp = LlmResponse.fromError("x", { errorCode });
			expect(resp.errorCode).toBe(errorCode || "UNKNOWN_ERROR");
		});
	}

	it("preserves Error instance identity", () => {
		const cause = new Error("preserve");
		const resp = LlmResponse.fromError(cause, {
			errorCode: "E",
			model: "m",
		});
		expect(resp.error).toBe(cause);
		expect(resp.errorMessage).toBe("LLM call failed for model m: preserve");
	});
});
