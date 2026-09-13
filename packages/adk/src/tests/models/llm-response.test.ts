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
	});
});
