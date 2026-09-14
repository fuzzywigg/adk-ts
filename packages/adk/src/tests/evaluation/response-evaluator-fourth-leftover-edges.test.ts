import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { ResponseEvaluator } from "../../evaluation/response-evaluator";

function inv(text?: string, overrides: Partial<Invocation> = {}): Invocation {
	return {
		userContent: { parts: [{ text: "u" }] },
		creationTimestamp: 1,
		finalResponse:
			text === undefined ? undefined : { role: "model", parts: [{ text }] },
		...overrides,
	};
}

describe("ResponseEvaluator fourth leftover edges", () => {
	it("rejects unsupported metric names in constructor", () => {
		expect(
			() =>
				new ResponseEvaluator({
					metricName: "not_a_real_metric" as any,
					threshold: 0.5,
				}),
		).toThrow(/not supported/i);
	});

	it("getMetricInfo rejects unsupported metric", () => {
		expect(() =>
			ResponseEvaluator.getMetricInfo(
				PrebuiltMetrics.TOOL_TRAJECTORY_AVG_SCORE,
			),
		).toThrow(/not supported/i);
	});

	it("getMetricInfo returns coherent score interval [1,5]", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
		);
		expect(info.metricValueInfo.interval).toEqual({
			minValue: 1.0,
			maxValue: 5.0,
			openAtMin: false,
			openAtMax: false,
		});
	});

	it("getMetricInfo returns match score interval [0,1]", () => {
		const info = ResponseEvaluator.getMetricInfo(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1.0);
	});

	it("rouge path throws when actual/expected lengths differ", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		await expect(
			evaluator.evaluateInvocations([inv("a")], [inv("a"), inv("b")]),
		).rejects.toThrow(/must match/i);
	});

	const rougePairs: Array<{
		label: string;
		actual?: string;
		expected?: string;
		expectScore?: number;
		expectNotEvaluated?: boolean;
	}> = [
		{
			label: "exact match",
			actual: "hello world",
			expected: "hello world",
			expectScore: 1,
		},
		{ label: "empty both", actual: "", expected: "", expectScore: 0 },
		{
			label: "whitespace both",
			actual: "   ",
			expected: "\t\n",
			expectScore: 0,
		},
		{
			label: "missing actual",
			actual: undefined,
			expected: "hello",
			expectNotEvaluated: true,
		},
		{
			label: "missing expected",
			actual: "hello",
			expected: undefined,
			expectNotEvaluated: true,
		},
		{
			label: "partial overlap",
			actual: "the cat sat",
			expected: "the dog sat",
			expectScore: 2 / 3,
		},
		{
			label: "case insensitive tokens",
			actual: "Hello",
			expected: "hello",
			expectScore: 1,
		},
		{
			label: "punctuation stripped",
			actual: "hi!",
			expected: "hi",
			expectScore: 1,
		},
	];

	for (const pair of rougePairs) {
		it(`rouge leftover: ${pair.label}`, async () => {
			const evaluator = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0.01,
			});
			const result = await evaluator.evaluateInvocations(
				[inv(pair.actual)],
				[inv(pair.expected)],
			);
			if (pair.expectNotEvaluated) {
				expect(result.perInvocationResults[0].evalStatus).toBe(
					EvalStatus.NOT_EVALUATED,
				);
				expect(result.perInvocationResults[0].score).toBeUndefined();
			} else if (pair.expectScore !== undefined) {
				expect(result.perInvocationResults[0].score).toBeCloseTo(
					pair.expectScore,
					5,
				);
			}
		});
	}

	it("all missing finals yield FAILED with undefined overallScore", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[inv(undefined), inv(undefined)],
			[inv("a"), inv("b")],
		);
		expect(result.overallScore).toBeUndefined();
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("multi-invocation rouge averages numeric scores only", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[inv("hello world"), inv(undefined), inv("hello world")],
			[inv("hello world"), inv("x"), inv("hello world")],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults).toHaveLength(3);
	});

	describe("RESPONSE_EVALUATION_SCORE facade path", () => {
		let originalProject: string | undefined;
		let originalLocation: string | undefined;

		beforeEach(() => {
			originalProject = process.env.GOOGLE_CLOUD_PROJECT;
			originalLocation = process.env.GOOGLE_CLOUD_LOCATION;
			process.env.GOOGLE_CLOUD_PROJECT = "test-project";
			process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
		});

		afterEach(() => {
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

		it("returns NOT_EVALUATED when cloud project env is missing", async () => {
			delete process.env.GOOGLE_CLOUD_PROJECT;
			const evaluator = new ResponseEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_EVALUATION_SCORE,
				threshold: 0.5,
			});
			const result = await evaluator.evaluateInvocations(
				[inv("a")],
				[inv("b")],
			);
			expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		});
	});

	it("threshold boundary: score equals threshold passes", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 1,
		});
		const result = await evaluator.evaluateInvocations(
			[inv("same tokens here")],
			[inv("same tokens here")],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("joins multiple text parts with spaces for rouge", async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 1,
		});
		const actual: Invocation = {
			userContent: { parts: [{ text: "u" }] },
			creationTimestamp: 1,
			finalResponse: {
				role: "model",
				parts: [{ text: "hello" }, { text: "world" }],
			},
		};
		const expected: Invocation = {
			userContent: { parts: [{ text: "u" }] },
			creationTimestamp: 1,
			finalResponse: { role: "model", parts: [{ text: "hello world" }] },
		};
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(1);
	});

	it('filters empty text parts via text || "" before joining', async () => {
		const evaluator = new ResponseEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 1,
		});
		const actual: Invocation = {
			userContent: { parts: [{ text: "u" }] },
			creationTimestamp: 1,
			finalResponse: {
				role: "model",
				parts: [{ text: "" }, { text: "keep" }, { text: undefined as any }],
			},
		};
		const expected: Invocation = {
			userContent: { parts: [{ text: "u" }] },
			creationTimestamp: 1,
			finalResponse: { role: "model", parts: [{ text: "keep" }] },
		};
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(1);
	});
});
