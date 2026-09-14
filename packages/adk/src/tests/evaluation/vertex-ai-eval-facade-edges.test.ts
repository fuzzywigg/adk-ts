import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

function invocation(opts: {
	user?: string;
	response?: string;
	userParts?: Array<{ text?: string }>;
	responseParts?: Array<{ text?: string }>;
}): Invocation {
	return {
		userContent: {
			parts: opts.userParts ?? [{ text: opts.user ?? "prompt" }],
		},
		finalResponse: {
			parts: opts.responseParts ?? [{ text: opts.response ?? "response" }],
		},
		creationTimestamp: 1,
	};
}

describe("VertexAiEvalFacade leftover edges", () => {
	const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
	const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		vi.spyOn(Math, "random").mockReturnValue(0.5);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		if (originalProject === undefined) {
			delete process.env.GOOGLE_CLOUD_PROJECT;
		} else {
			process.env.GOOGLE_CLOUD_PROJECT = originalProject;
		}
		if (originalLocation === undefined) {
			delete process.env.GOOGLE_CLOUD_LOCATION;
		} else {
			process.env.GOOGLE_CLOUD_LOCATION = originalLocation;
		}
	});

	describe("p.text || '' in _getText", () => {
		it("treats undefined text as empty string in parts", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as never, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.8 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const expected: Invocation = {
				userContent: {
					parts: [{ text: undefined }, { text: "visible" }],
				},
				finalResponse: {
					parts: [{ text: undefined }, { text: "ref" }],
				},
				creationTimestamp: 1,
			};
			const actual: Invocation = {
				userContent: { parts: [{ text: "u" }] },
				finalResponse: {
					parts: [{ text: undefined }, { text: "act" }],
				},
				creationTimestamp: 1,
			};
			await facade.evaluateInvocations([actual], [expected]);
			expect(perform).toHaveBeenCalledWith(
				[{ prompt: "visible", reference: "ref", response: "act" }],
				[PrebuiltMetrics.SAFETY_V1],
			);
		});

		it("filters empty-string text parts after p.text || ''", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as never, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.9 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const expected: Invocation = {
				userContent: {
					parts: [{ text: "" }, { text: "one" }, { text: "" }],
				},
				finalResponse: {
					parts: [{ text: "" }, { text: "ref" }],
				},
				creationTimestamp: 1,
			};
			await facade.evaluateInvocations(
				[invocation({ response: "act" })],
				[expected],
			);
			expect(perform).toHaveBeenCalledWith(
				[{ prompt: "one", reference: "ref", response: "act" }],
				[PrebuiltMetrics.SAFETY_V1],
			);
		});

		it("returns empty string when content has no parts", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as never, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.7 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const bare = { creationTimestamp: 1 } as Invocation;
			await facade.evaluateInvocations([bare], [bare]);
			expect(perform).toHaveBeenCalledWith(
				[{ prompt: "", reference: "", response: "" }],
				[PrebuiltMetrics.SAFETY_V1],
			);
		});
	});

	describe("empty summaryMetrics", () => {
		it("marks per-invocation NOT_EVALUATED when summaryMetrics is empty array", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
				summaryMetrics: [],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("marks NOT_EVALUATED when summaryMetrics is missing entirely", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue(
				{},
			);
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("marks NOT_EVALUATED when meanScore is null", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: null }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
		});
	});

	describe("catch paths with mocks", () => {
		it("logs string rejection from _performEval without inventing credentials", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockRejectedValue(
				"vertex unavailable",
			);
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(console.error).toHaveBeenCalledWith(
				"Error evaluating invocation:",
				"vertex unavailable",
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
		});

		it("catches Error from _performEval and continues loop", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval")
				.mockRejectedValueOnce(new Error("transient"))
				.mockResolvedValueOnce({ summaryMetrics: [{ meanScore: 0.9 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a1" }), invocation({ response: "a2" })],
				[invocation({ response: "e1" }), invocation({ response: "e2" })],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.perInvocationResults[1].score).toBe(0.9);
			expect(result.overallScore).toBeCloseTo(0.9);
		});

		it("uses env-based missing project error in catch path without real GCP", async () => {
			delete process.env.GOOGLE_CLOUD_PROJECT;
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(console.error).toHaveBeenCalledWith(
				"Error evaluating invocation:",
				expect.objectContaining({
					message: expect.stringContaining("Missing project id"),
				}),
			);
		});

		it("uses env-based missing location error in catch path", async () => {
			delete process.env.GOOGLE_CLOUD_LOCATION;
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(console.error).toHaveBeenCalledWith(
				"Error evaluating invocation:",
				expect.objectContaining({
					message: expect.stringMatching(/Missing location/),
				}),
			);
		});
	});

	describe("_getEvalStatus threshold edges", () => {
		it("marks PASSED when score equals threshold", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: 0.75 }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.75,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("marks FAILED when score is below threshold", async () => {
			vi.spyOn(VertexAiEvalFacade as never, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: 0.49 }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});
	});

	describe("empty invocation list", () => {
		it("returns NOT_EVALUATED with undefined overallScore", async () => {
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations([], []);
			expect(result).toEqual({
				overallScore: undefined,
				overallEvalStatus: EvalStatus.NOT_EVALUATED,
				perInvocationResults: [],
			});
		});
	});

	describe("live mock path with test-project env", () => {
		it("scores via Math.random mock without real Vertex credentials", async () => {
			vi.spyOn(Math, "random").mockReturnValue(0);
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "b" })],
			);
			expect(result.overallScore).toBeCloseTo(0.5);
			expect(console.warn).toHaveBeenCalledWith(
				expect.stringMatching(/not fully implemented/i),
			);
		});
	});
});
