import { describe, expect, it } from "vitest";
import { LlmResponse } from "../../models/llm-response";

describe("LlmResponse", () => {
	describe("constructor", () => {
		it("should assign properties from data", () => {
			const resp = new LlmResponse({
				id: "id1",
				content: { parts: [{ text: "hi" }] } as any,
				errorCode: "ERR",
				errorMessage: "fail",
				usageMetadata: { totalTokens: 5 } as any,
			});
			expect(resp.id).toBe("id1");
			expect(resp.content).toEqual({ parts: [{ text: "hi" }] });
			expect(resp.errorCode).toBe("ERR");
			expect(resp.errorMessage).toBe("fail");
			expect(resp.usageMetadata).toEqual({ totalTokens: 5 });
		});
	});

	describe("create", () => {
		it("should return LlmResponse with content if candidate has content.parts", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { parts: [{ text: "hello" }] },
						groundingMetadata: { foo: "bar" } as any,
					},
				],
				usageMetadata: { totalTokens: 10 } as any,
			});
			expect(resp.content).toEqual({ parts: [{ text: "hello" }] });
			expect(resp.groundingMetadata).toEqual({ foo: "bar" });
			expect(resp.usageMetadata).toEqual({ totalTokens: 10 });
			expect(resp.errorCode).toBeUndefined();
			expect(resp.errorMessage).toBeUndefined();
		});

		it("treats empty parts array as success because parts is truthy", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { role: "model", parts: [] },
						groundingMetadata: { source: "empty-parts" } as any,
					},
				],
				usageMetadata: { totalTokens: 3 } as any,
			});
			expect(resp.content).toEqual({ role: "model", parts: [] });
			expect(resp.groundingMetadata).toEqual({ source: "empty-parts" });
			expect(resp.errorCode).toBeUndefined();
			expect(resp.usageMetadata).toEqual({ totalTokens: 3 });
		});

		it("should return error LlmResponse if candidate has no content.parts", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						finishReason: "STOP",
						finishMessage: "Stopped",
					},
				],
				usageMetadata: { totalTokens: 2 } as any,
			});
			expect(resp.errorCode).toBe("STOP");
			expect(resp.errorMessage).toBe("Stopped");
			expect(resp.usageMetadata).toEqual({ totalTokens: 2 });
			expect(resp.content).toBeUndefined();
		});

		it("returns finishReason error when content exists without parts", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { role: "model" } as any,
						finishReason: "MAX_TOKENS",
						finishMessage: "truncated",
					},
				],
			});
			expect(resp.errorCode).toBe("MAX_TOKENS");
			expect(resp.errorMessage).toBe("truncated");
			expect(resp.content).toBeUndefined();
		});

		it("prefers the first candidate over promptFeedback when both exist", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { parts: [{ text: "winner" }] },
					},
					{
						content: { parts: [{ text: "ignored" }] },
					},
				],
				promptFeedback: {
					blockReason: "SHOULD_NOT_WIN",
					blockReasonMessage: "ignored feedback",
				},
			});
			expect(resp.content).toEqual({ parts: [{ text: "winner" }] });
			expect(resp.errorCode).toBeUndefined();
		});

		it("falls through empty candidates array to promptFeedback", () => {
			const resp = LlmResponse.create({
				candidates: [],
				promptFeedback: {
					blockReason: "EMPTY_CANDIDATES",
					blockReasonMessage: "no candidates",
				},
				usageMetadata: { totalTokens: 1 } as any,
			});
			expect(resp.errorCode).toBe("EMPTY_CANDIDATES");
			expect(resp.errorMessage).toBe("no candidates");
			expect(resp.usageMetadata).toEqual({ totalTokens: 1 });
		});

		it("should return error LlmResponse from promptFeedback if no candidates", () => {
			const resp = LlmResponse.create({
				promptFeedback: {
					blockReason: "BLOCKED",
					blockReasonMessage: "Blocked for safety",
				},
				usageMetadata: { totalTokens: 1 } as any,
			});
			expect(resp.errorCode).toBe("BLOCKED");
			expect(resp.errorMessage).toBe("Blocked for safety");
			expect(resp.usageMetadata).toEqual({ totalTokens: 1 });
			expect(resp.content).toBeUndefined();
		});

		it("should return UNKNOWN_ERROR if no candidates or promptFeedback", () => {
			const resp = LlmResponse.create({
				usageMetadata: { totalTokens: 0 } as any,
			});
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toBe("Unknown error.");
			expect(resp.usageMetadata).toEqual({ totalTokens: 0 });
			expect(resp.content).toBeUndefined();
		});

		it("returns UNKNOWN_ERROR for empty candidates without promptFeedback", () => {
			const resp = LlmResponse.create({ candidates: [] });
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toBe("Unknown error.");
		});
	});

	describe("fromError", () => {
		it("wraps Error instances with model context", () => {
			const cause = new Error("rate limited");
			const resp = LlmResponse.fromError(cause, {
				errorCode: "RATE_LIMIT",
				model: "gpt-4o",
			});

			expect(resp.errorCode).toBe("RATE_LIMIT");
			expect(resp.errorMessage).toContain("gpt-4o");
			expect(resp.errorMessage).toContain("rate limited");
			expect(resp.content?.parts?.[0]?.text).toBe("Error: rate limited");
			expect(resp.content?.role).toBe("model");
			expect(resp.finishReason).toBe("STOP");
			expect(resp.error).toBe(cause);
		});

		it("stringifies non-Error values and defaults codes", () => {
			const resp = LlmResponse.fromError("boom");
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toContain("model unknown");
			expect(resp.errorMessage).toContain("boom");
			expect(resp.error).toBeInstanceOf(Error);
			expect(resp.error?.message).toBe("boom");
		});

		it("uses provided errorCode without model override", () => {
			const resp = LlmResponse.fromError(new Error("x"), {
				errorCode: "CUSTOM",
			});
			expect(resp.errorCode).toBe("CUSTOM");
			expect(resp.errorMessage).toBe("LLM call failed for model unknown: x");
		});

		it("uses provided model with default UNKNOWN_ERROR code", () => {
			const resp = LlmResponse.fromError("nope", { model: "claude-3" });
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toBe(
				"LLM call failed for model claude-3: nope",
			);
			expect(resp.finishReason).toBe("STOP");
		});
	});
});
