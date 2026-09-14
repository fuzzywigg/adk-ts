import { describe, expect, it } from "vitest";
import { LlmResponse } from "../../models/llm-response";

describe("LlmResponse leftover edges", () => {
	describe("constructor field matrix", () => {
		it("leaves all fields undefined when constructed empty", () => {
			const resp = new LlmResponse();
			expect(resp.id).toBeUndefined();
			expect(resp.text).toBeUndefined();
			expect(resp.content).toBeUndefined();
			expect(resp.groundingMetadata).toBeUndefined();
			expect(resp.partial).toBeUndefined();
			expect(resp.turnComplete).toBeUndefined();
			expect(resp.errorCode).toBeUndefined();
			expect(resp.errorMessage).toBeUndefined();
			expect(resp.interrupted).toBeUndefined();
			expect(resp.customMetadata).toBeUndefined();
			expect(resp.usageMetadata).toBeUndefined();
			expect(resp.candidateIndex).toBeUndefined();
			expect(resp.finishReason).toBeUndefined();
			expect(resp.error).toBeUndefined();
		});

		it("assigns the full optional field surface from Partial data", () => {
			const error = new Error("boom");
			const resp = new LlmResponse({
				id: "r1",
				text: "plain",
				content: { role: "model", parts: [{ text: "c" }] },
				groundingMetadata: { sources: [] } as any,
				partial: true,
				turnComplete: false,
				errorCode: "E",
				errorMessage: "m",
				interrupted: true,
				customMetadata: { k: 1 },
				usageMetadata: { totalTokens: 9 } as any,
				candidateIndex: 0,
				finishReason: "STOP",
				error,
			});
			expect(resp.id).toBe("r1");
			expect(resp.text).toBe("plain");
			expect(resp.content?.parts?.[0]).toEqual({ text: "c" });
			expect(resp.groundingMetadata).toEqual({ sources: [] });
			expect(resp.partial).toBe(true);
			expect(resp.turnComplete).toBe(false);
			expect(resp.errorCode).toBe("E");
			expect(resp.errorMessage).toBe("m");
			expect(resp.interrupted).toBe(true);
			expect(resp.customMetadata).toEqual({ k: 1 });
			expect(resp.usageMetadata).toEqual({ totalTokens: 9 });
			expect(resp.candidateIndex).toBe(0);
			expect(resp.finishReason).toBe("STOP");
			expect(resp.error).toBe(error);
		});

		it("Object.assign overwrites only provided keys", () => {
			const resp = new LlmResponse({ id: "keep", partial: true });
			Object.assign(resp, { partial: false });
			expect(resp.id).toBe("keep");
			expect(resp.partial).toBe(false);
		});
	});

	describe("create() branch leftovers", () => {
		it("treats truthy non-array parts as success content path", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { role: "model", parts: "not-array" as any },
						groundingMetadata: { g: 1 } as any,
					},
				],
				usageMetadata: { totalTokens: 2 } as any,
			});
			expect(resp.content).toEqual({ role: "model", parts: "not-array" });
			expect(resp.groundingMetadata).toEqual({ g: 1 });
			expect(resp.errorCode).toBeUndefined();
			expect(resp.usageMetadata).toEqual({ totalTokens: 2 });
		});

		it("uses finishReason/finishMessage when parts is missing on content", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { role: "model" } as any,
						finishReason: "SAFETY",
						finishMessage: "blocked",
					},
				],
			});
			expect(resp.errorCode).toBe("SAFETY");
			expect(resp.errorMessage).toBe("blocked");
			expect(resp.content).toBeUndefined();
		});

		it("uses finishReason path when content is missing entirely", () => {
			const resp = LlmResponse.create({
				candidates: [{ finishReason: "OTHER", finishMessage: "none" }],
			});
			expect(resp.errorCode).toBe("OTHER");
			expect(resp.errorMessage).toBe("none");
		});

		it("preserves undefined finishMessage on candidate error path", () => {
			const resp = LlmResponse.create({
				candidates: [{ finishReason: "STOP" }],
			});
			expect(resp.errorCode).toBe("STOP");
			expect(resp.errorMessage).toBeUndefined();
		});

		it("ignores later candidates when the first lacks parts", () => {
			const resp = LlmResponse.create({
				candidates: [
					{ finishReason: "FIRST", finishMessage: "first wins" },
					{ content: { parts: [{ text: "second" }] } },
				],
			});
			expect(resp.errorCode).toBe("FIRST");
			expect(resp.content).toBeUndefined();
		});

		it.each([
			{ candidates: null as any, label: "null candidates" },
			{ candidates: undefined, label: "undefined candidates" },
		])("falls through $label to promptFeedback when present", ({
			candidates,
		}) => {
			const resp = LlmResponse.create({
				candidates,
				promptFeedback: {
					blockReason: "PF",
					blockReasonMessage: "feedback",
				},
			});
			expect(resp.errorCode).toBe("PF");
			expect(resp.errorMessage).toBe("feedback");
		});

		it("promptFeedback can omit blockReasonMessage", () => {
			const resp = LlmResponse.create({
				promptFeedback: { blockReason: "ONLY_REASON" },
			});
			expect(resp.errorCode).toBe("ONLY_REASON");
			expect(resp.errorMessage).toBeUndefined();
		});

		it("UNKNOWN_ERROR carries usageMetadata when present", () => {
			const resp = LlmResponse.create({
				usageMetadata: { promptTokenCount: 3 } as any,
			});
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toBe("Unknown error.");
			expect(resp.usageMetadata).toEqual({ promptTokenCount: 3 });
		});

		it("UNKNOWN_ERROR when candidates empty and promptFeedback absent", () => {
			const resp = LlmResponse.create({ candidates: [] });
			expect(resp).toBeInstanceOf(LlmResponse);
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.usageMetadata).toBeUndefined();
		});

		it("success path does not copy finishReason from candidate", () => {
			const resp = LlmResponse.create({
				candidates: [
					{
						content: { parts: [{ text: "ok" }] },
						finishReason: "STOP",
						finishMessage: "ignored-on-success",
					},
				],
			});
			expect(resp.content).toEqual({ parts: [{ text: "ok" }] });
			expect(resp.errorCode).toBeUndefined();
			expect(resp.finishReason).toBeUndefined();
		});
	});

	describe("fromError leftovers", () => {
		it.each([
			[42, "42"],
			[null, "null"],
			[{ msg: "x" }, "[object Object]"],
			[true, "true"],
		])("stringifies non-Error value %#", (value, expectedMessage) => {
			const resp = LlmResponse.fromError(value);
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toContain(expectedMessage);
			expect(resp.content?.parts?.[0]?.text).toBe(`Error: ${expectedMessage}`);
			expect(resp.error).toBeInstanceOf(Error);
			expect(resp.error?.message).toBe(expectedMessage);
			expect(resp.finishReason).toBe("STOP");
			expect(resp.content?.role).toBe("model");
		});

		it("keeps original Error instance when provided", () => {
			const cause = new Error("network");
			const resp = LlmResponse.fromError(cause, {
				model: "test-model",
				errorCode: "NET",
			});
			expect(resp.error).toBe(cause);
			expect(resp.errorMessage).toBe(
				"LLM call failed for model test-model: network",
			);
			expect(resp.errorCode).toBe("NET");
		});

		it("defaults model label to unknown when options omit model", () => {
			const resp = LlmResponse.fromError(new Error("x"), {
				errorCode: "C",
			});
			expect(resp.errorMessage).toBe("LLM call failed for model unknown: x");
		});

		it("empty options object still defaults code and model", () => {
			const resp = LlmResponse.fromError("z", {});
			expect(resp.errorCode).toBe("UNKNOWN_ERROR");
			expect(resp.errorMessage).toBe("LLM call failed for model unknown: z");
		});
	});
});
