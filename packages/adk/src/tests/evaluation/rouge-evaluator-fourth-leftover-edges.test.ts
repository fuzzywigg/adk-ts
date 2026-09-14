import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";

function inv(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "u" }] },
		creationTimestamp: 1,
		finalResponse:
			text === undefined ? undefined : { role: "model", parts: [{ text }] },
	};
}

describe("RougeEvaluator fourth leftover edges", () => {
	it("exposes RESPONSE_MATCH_SCORE metric info", () => {
		const info = RougeEvaluator.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(info.metricValueInfo.interval).toEqual({
			minValue: 0.0,
			maxValue: 1.0,
			openAtMin: false,
			openAtMax: false,
		});
	});

	it("empty invocation lists return NOT_EVALUATED", async () => {
		const evaluator = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations([], []);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		expect(result.perInvocationResults).toEqual([]);
		expect(result.overallScore).toBeUndefined();
	});

	const cases: Array<{
		label: string;
		actual?: string;
		expected?: string;
		score: number;
	}> = [
		{
			label: "identical",
			actual: "alpha beta",
			expected: "alpha beta",
			score: 1,
		},
		{ label: "disjoint", actual: "alpha", expected: "omega", score: 0 },
		{ label: "empty actual", actual: "", expected: "alpha", score: 0 },
		{ label: "empty expected", actual: "alpha", expected: "", score: 0 },
		{ label: "both empty", actual: "", expected: "", score: 0 },
		{
			label: "missing actual content",
			actual: undefined,
			expected: "x",
			score: 0,
		},
		{
			label: "missing expected content",
			actual: "x",
			expected: undefined,
			score: 0,
		},
		{
			label: "subset recall",
			actual: "the quick brown",
			expected: "the quick brown fox",
			score: (2 * 1 * 0.75) / (1 + 0.75),
		},
		{ label: "case fold", actual: "Alpha", expected: "alpha", score: 1 },
		{ label: "punct", actual: "hi, there!", expected: "hi there", score: 1 },
	];

	for (const c of cases) {
		it(`rouge1 matrix: ${c.label}`, async () => {
			const evaluator = new RougeEvaluator({
				metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
				threshold: 0,
			});
			const result = await evaluator.evaluateInvocations(
				[inv(c.actual)],
				[inv(c.expected)],
			);
			expect(result.perInvocationResults[0].score).toBeCloseTo(c.score, 5);
			expect(result.overallScore).toBeCloseTo(c.score, 5);
		});
	}

	it("averages multiple invocations", async () => {
		const evaluator = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await evaluator.evaluateInvocations(
			[inv("same"), inv("totally different words")],
			[inv("same"), inv("other stuff entirely")],
		);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when average below threshold", async () => {
		const evaluator = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.9,
		});
		const result = await evaluator.evaluateInvocations(
			[inv("same"), inv("nope")],
			[inv("same"), inv("other")],
		);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("joins multi-part text with newlines", async () => {
		const evaluator = new RougeEvaluator({
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
			finalResponse: {
				role: "model",
				parts: [{ text: "hello\nworld" }],
			},
		};
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(1);
	});

	it("filters falsy part.text via filter(Boolean)", async () => {
		const evaluator = new RougeEvaluator({
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
