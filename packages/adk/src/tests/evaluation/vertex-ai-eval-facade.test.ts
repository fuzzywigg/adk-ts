import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

function invocation(opts: {
	user?: string;
	response?: string;
	parts?: Array<{ text?: string }>;
}): Invocation {
	return {
		userContent: {
			parts: opts.parts ?? [{ text: opts.user ?? "prompt" }],
		},
		finalResponse: opts.response
			? { parts: [{ text: opts.response }] }
			: { parts: [{ text: "response" }] },
		creationTimestamp: 1,
	};
}

describe("VertexAiEvalFacade", () => {
	const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
	const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

	beforeEach(() => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		vi.spyOn(Math, "random").mockReturnValue(0.8);
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

	it("returns NOT_EVALUATED for an empty invocation list", async () => {
		const facade = new VertexAiEvalFacade({
			threshold: 0.7,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations([], []);
		expect(result).toEqual({
			overallScore: undefined,
			overallEvalStatus: EvalStatus.NOT_EVALUATED,
			perInvocationResults: [],
		});
	});

	it("scores invocations with the mock Vertex response and marks PASSED", async () => {
		const facade = new VertexAiEvalFacade({
			threshold: 0.7,
			metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ user: "q", response: "actual" })],
			[invocation({ user: "q", response: "expected" })],
		);

		expect(console.warn).toHaveBeenCalledWith(
			expect.stringMatching(/not fully implemented/i),
		);
		expect(result.overallScore).toBeCloseTo(0.8 * 0.5 + 0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults).toHaveLength(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBeCloseTo(0.9);
	});

	it("marks FAILED when mock score is below threshold", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const facade = new VertexAiEvalFacade({
			threshold: 0.9,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ response: "a" })],
			[invocation({ response: "b" })],
		);

		expect(result.overallScore).toBeCloseTo(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("joins multi-part text and skips empty parts when building prompts", async () => {
		const facade = new VertexAiEvalFacade({
			threshold: 0.1,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const expected: Invocation = {
			userContent: {
				parts: [{ text: "one" }, { text: "" }, { text: "two" }],
			},
			finalResponse: { parts: [{ text: "ref-a" }, { text: "ref-b" }] },
			creationTimestamp: 1,
		};
		const actual: Invocation = {
			userContent: { parts: [{ text: "ignored" }] },
			finalResponse: { parts: [{ text: "act" }] },
			creationTimestamp: 1,
		};

		const result = await facade.evaluateInvocations([actual], [expected]);
		expect(result.perInvocationResults).toHaveLength(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("uses empty strings when content has no parts", async () => {
		const facade = new VertexAiEvalFacade({
			threshold: 0.1,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const bare: Invocation = {
			userContent: {},
			finalResponse: {},
			creationTimestamp: 1,
		};
		const result = await facade.evaluateInvocations([bare], [bare]);
		expect(result.perInvocationResults).toHaveLength(1);
		expect(result.overallScore).toBeDefined();
	});

	it("records NOT_EVALUATED when project id is missing", async () => {
		delete process.env.GOOGLE_CLOUD_PROJECT;
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ response: "a" })],
			[invocation({ response: "b" })],
		);

		expect(console.error).toHaveBeenCalled();
		expect(result.overallScore).toBeUndefined();
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.perInvocationResults[0].score).toBeUndefined();
	});

	it("records NOT_EVALUATED when location is missing", async () => {
		delete process.env.GOOGLE_CLOUD_LOCATION;
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ response: "a" })],
			[invocation({ response: "b" })],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
	});

	it("averages scores across multiple invocations", async () => {
		vi.spyOn(Math, "random").mockReturnValueOnce(1).mockReturnValueOnce(0);
		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		});
		const result = await facade.evaluateInvocations(
			[invocation({ response: "a1" }), invocation({ response: "a2" })],
			[invocation({ response: "e1" }), invocation({ response: "e2" })],
		);

		const first = 1 * 0.5 + 0.5;
		const second = 0 * 0.5 + 0.5;
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.overallScore).toBeCloseTo((first + second) / 2);
	});

	describe("_performEval score extraction and dataset wiring", () => {
		it("marks PASSED when score equals threshold exactly", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: 0.75 }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.75,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.overallScore).toBe(0.75);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		});

		it("marks FAILED when score is zero and threshold is positive", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: 0 }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.1,
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.overallScore).toBe(0);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		});

		it("marks PASSED when score is zero and threshold is zero", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: 0 }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("treats empty _performEval payload as NOT_EVALUATED", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.perInvocationResults[0].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(result.perInvocationResults).toHaveLength(1);
		});

		it("treats empty summaryMetrics as NOT_EVALUATED", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("ignores non-number meanScore values", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: "0.9" }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});

		it("ignores NaN meanScore values", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: Number.NaN }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
		});

		it("ignores undefined meanScore entries", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: undefined }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.perInvocationResults[0].score).toBeUndefined();
		});

		it("forwards metricName as a single-element metrics array", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.9 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			});
			await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(perform).toHaveBeenCalledWith(expect.any(Array), [
				PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			]);
		});

		it("builds prompt from expected.userContent and response from actual", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.8 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			await facade.evaluateInvocations(
				[invocation({ user: "actual-user", response: "actual-answer" })],
				[invocation({ user: "expected-user", response: "expected-answer" })],
			);
			expect(perform).toHaveBeenCalledWith(
				[
					{
						prompt: "expected-user",
						reference: "expected-answer",
						response: "actual-answer",
					},
				],
				[PrebuiltMetrics.SAFETY_V1],
			);
		});

		it("joins multi-part expected text into prompt/reference dataset fields", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 1 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const expected: Invocation = {
				userContent: {
					parts: [{ text: "one" }, { text: "" }, { text: "two" }],
				},
				finalResponse: {
					parts: [{ text: "ref-a" }, { text: "ref-b" }],
				},
				creationTimestamp: 1,
			};
			const actual: Invocation = {
				userContent: { parts: [{ text: "ignored" }] },
				finalResponse: { parts: [{ text: "act" }] },
				creationTimestamp: 1,
			};
			await facade.evaluateInvocations([actual], [expected]);
			expect(perform).toHaveBeenCalledWith(
				[
					{
						prompt: "one\ntwo",
						reference: "ref-a\nref-b",
						response: "act",
					},
				],
				[PrebuiltMetrics.SAFETY_V1],
			);
		});

		it("uses empty strings when userContent/finalResponse are omitted", async () => {
			const perform = vi
				.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.6 }] });
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

		it("averages only successful scores when a later invocation throws", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockResolvedValueOnce({ summaryMetrics: [{ meanScore: 0.8 }] })
				.mockRejectedValueOnce(new Error("vertex down"));
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a1" }), invocation({ response: "a2" })],
				[invocation({ response: "e1" }), invocation({ response: "e2" })],
			);
			expect(console.error).toHaveBeenCalled();
			expect(result.perInvocationResults).toHaveLength(2);
			expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
			expect(result.perInvocationResults[1].evalStatus).toBe(
				EvalStatus.NOT_EVALUATED,
			);
			expect(result.overallScore).toBeCloseTo(0.8);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		});

		it("averages only successful scores when the first invocation throws", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockRejectedValueOnce(new Error("first fail"))
				.mockResolvedValueOnce({ summaryMetrics: [{ meanScore: 0.4 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a1" }), invocation({ response: "a2" })],
				[invocation({ response: "e1" }), invocation({ response: "e2" })],
			);
			expect(result.overallScore).toBeCloseTo(0.4);
			expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
			expect(result.perInvocationResults[0].score).toBeUndefined();
			expect(result.perInvocationResults[1].score).toBe(0.4);
		});

		it("returns overall NOT_EVALUATED when every invocation fails", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockRejectedValue(
				new Error("always fail"),
			);
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a1" }), invocation({ response: "a2" })],
				[invocation({ response: "e1" }), invocation({ response: "e2" })],
			);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(result.perInvocationResults).toHaveLength(2);
		});

		it("returns overall NOT_EVALUATED when every score is undefined", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: "bad" }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a1" }), invocation({ response: "a2" })],
				[invocation({ response: "e1" }), invocation({ response: "e2" })],
			);
			expect(result.overallScore).toBeUndefined();
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
			expect(result.perInvocationResults).toHaveLength(2);
		});

		it("includes Missing project id wording in the caught error path", async () => {
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

		it("includes Missing location wording in the caught error path", async () => {
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
					message: expect.stringMatching(
						/Missing location[\s\S]*GOOGLE_CLOUD_LOCATION/,
					),
				}),
			);
		});

		it("uses Math.random mock score formula on the live mock path", async () => {
			vi.spyOn(Math, "random").mockReturnValue(0.2);
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const result = await facade.evaluateInvocations(
				[invocation({ response: "a" })],
				[invocation({ response: "e" })],
			);
			expect(result.overallScore).toBeCloseTo(0.2 * 0.5 + 0.5);
		});

		it("preserves actual and expected invocation objects on per-invocation rows", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval").mockResolvedValue({
				summaryMetrics: [{ meanScore: 0.9 }],
			});
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.SAFETY_V1,
			});
			const actual = invocation({ response: "actual" });
			const expected = invocation({ response: "expected" });
			const result = await facade.evaluateInvocations([actual], [expected]);
			expect(result.perInvocationResults[0].actualInvocation).toBe(actual);
			expect(result.perInvocationResults[0].expectedInvocation).toBe(expected);
		});

		it("averages three successful scores", async () => {
			vi.spyOn(VertexAiEvalFacade as any, "_performEval")
				.mockResolvedValueOnce({ summaryMetrics: [{ meanScore: 0.3 }] })
				.mockResolvedValueOnce({ summaryMetrics: [{ meanScore: 0.6 }] })
				.mockResolvedValueOnce({ summaryMetrics: [{ meanScore: 0.9 }] });
			const facade = new VertexAiEvalFacade({
				threshold: 0.5,
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
			});
			const result = await facade.evaluateInvocations(
				[
					invocation({ response: "a1" }),
					invocation({ response: "a2" }),
					invocation({ response: "a3" }),
				],
				[
					invocation({ response: "e1" }),
					invocation({ response: "e2" }),
					invocation({ response: "e3" }),
				],
			);
			expect(result.overallScore).toBeCloseTo(0.6);
			expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
			expect(result.perInvocationResults.map((r) => r.evalStatus)).toEqual([
				EvalStatus.FAILED,
				EvalStatus.PASSED,
				EvalStatus.PASSED,
			]);
		});
	});
});
