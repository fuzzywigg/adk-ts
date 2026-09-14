import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { EvalStatus } from "../../evaluation/evaluator";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

function multiPartInvocation(
	parts: Array<{ text?: string } | Record<string, unknown>>,
): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts: parts as any },
	};
}

function rougeF1(response: string, reference: string): number {
	const tokenize = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^\w\s]/g, " ")
			.split(/\s+/)
			.filter((t) => t.length > 0);
	const responseUnigrams = new Set(tokenize(response));
	const referenceUnigrams = new Set(tokenize(reference));
	const common = [...responseUnigrams].filter((t) => referenceUnigrams.has(t));
	const precision =
		responseUnigrams.size > 0 ? common.length / responseUnigrams.size : 0;
	const recall =
		referenceUnigrams.size > 0 ? common.length / referenceUnigrams.size : 0;
	return precision + recall > 0
		? (2 * precision * recall) / (precision + recall)
		: 0;
}

describe("RougeEvaluator", () => {
	const evaluator = new RougeEvaluator({
		metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		threshold: 0.5,
	});

	it("exposes metric info", () => {
		const info = RougeEvaluator.getMetricInfo();
		expect(info.metricName).toBe(PrebuiltMetrics.RESPONSE_MATCH_SCORE);
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
		expect(info.metricValueInfo.interval?.openAtMin).toBe(false);
		expect(info.metricValueInfo.interval?.openAtMax).toBe(false);
		expect(info.description).toMatch(/Rouge_1/i);
	});

	it("scores identical responses as a perfect match", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("The quick brown fox")],
			[invocation("The quick brown fox")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores unrelated responses as failed", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("alpha beta")],
			[invocation("completely different words")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores empty texts as zero and failed under default threshold", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("")],
			[invocation("")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("returns NOT_EVALUATED when there are no invocations", async () => {
		const result = await evaluator.evaluateInvocations([], []);
		expect(result.overallEvalStatus).toBe(EvalStatus.NOT_EVALUATED);
		expect(result.perInvocationResults).toEqual([]);
		expect(result.overallScore).toBeUndefined();
	});

	it("aggregates average score across invocations", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("shared token here"), invocation("zzz")],
			[invocation("shared token there"), invocation("yyy")],
		);

		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.overallScore).toBeGreaterThan(0);
		expect(result.overallScore).toBeLessThan(1);
		expect(result.overallScore).toBe(
			((result.perInvocationResults[0].score as number) +
				(result.perInvocationResults[1].score as number)) /
				2,
		);
	});

	it("scores missing finalResponse as zero (empty text path)", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation()],
			[invocation("expected text")],
		);

		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("matches despite punctuation and case differences via tokenization", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("Hello, World!")],
			[invocation("hello world")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
	});

	it("scores asymmetric unigram overlap with exact Rouge-1 F1", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a b")],
		);
		expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
		expect(result.overallScore).toBeCloseTo(0.8);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores response that is a strict subset with lower precision than recall", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("a b")],
			[invocation("a b c")],
		);
		expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
	});

	it("joins multi-part finalResponse text with newlines before scoring", async () => {
		const result = await evaluator.evaluateInvocations(
			[multiPartInvocation([{ text: "hello" }, { text: "world" }])],
			[invocation("hello\nworld")],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("filters falsy/empty part texts when extracting content", async () => {
		const result = await evaluator.evaluateInvocations(
			[
				multiPartInvocation([
					{ text: "alpha" },
					{ text: "" },
					{},
					{ text: "beta" },
					{ inlineData: { data: "x", mimeType: "text/plain" } },
				]),
			],
			[invocation("alpha\nbeta")],
		);
		expect(result.overallScore).toBe(1);
	});

	it("treats whitespace-only response as empty (zero score)", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("   \t\n  ")],
			[invocation("meaningful reference")],
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("treats whitespace-only reference as empty (zero score)", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("meaningful response")],
			[invocation("  \n\t ")],
		);
		expect(result.overallScore).toBe(0);
	});

	it("passes when score equals threshold exactly", async () => {
		const strict = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.8,
		});
		const result = await strict.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a b")],
		);
		expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when score is just below threshold", async () => {
		const strict = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.81,
		});
		const result = await strict.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a b")],
		);
		expect(result.perInvocationResults[0].score).toBeCloseTo(0.8);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("deduplicates repeated unigrams via Set-based Rouge-1", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("cat cat cat dog")],
			[invocation("cat dog dog")],
		);
		expect(result.perInvocationResults[0].score).toBe(1);
	});

	it("ignores punctuation-only tokens after tokenization", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("!!! ??? ---")],
			[invocation("hello")],
		);
		expect(result.overallScore).toBe(0);
	});

	it("handles numeric and underscore tokens as word characters", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("order_id_42 scored 99")],
			[invocation("ORDER_ID_42 scored 99")],
		);
		expect(result.overallScore).toBe(1);
	});

	it("scores partial overlap across three invocations with known average", async () => {
		const actuals = [
			invocation("red blue"),
			invocation("one two three"),
			invocation("nope"),
		];
		const expecteds = [
			invocation("red green"),
			invocation("one two"),
			invocation("yes"),
		];
		const result = await evaluator.evaluateInvocations(actuals, expecteds);

		const expectedScores = [
			rougeF1("red blue", "red green"),
			rougeF1("one two three", "one two"),
			rougeF1("nope", "yes"),
		];
		const expectedAvg =
			expectedScores.reduce((a, b) => a + b, 0) / expectedScores.length;

		for (let i = 0; i < expectedScores.length; i++) {
			expect(result.perInvocationResults[i].score).toBeCloseTo(
				expectedScores[i],
			);
		}
		expect(result.overallScore).toBeCloseTo(expectedAvg);
		expect(result.perInvocationResults).toHaveLength(3);
		expect(result.perInvocationResults[0].actualInvocation).toBe(actuals[0]);
		expect(result.perInvocationResults[0].expectedInvocation).toBe(
			expecteds[0],
		);
	});

	it("scores when both sides omit finalResponse (empty vs empty)", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation()],
			[invocation()],
		);
		expect(result.overallScore).toBe(0);
		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores when expected omits finalResponse but actual has text", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("present")],
			[invocation()],
		);
		expect(result.overallScore).toBe(0);
	});

	it("handles unicode letters that survive word-char tokenization", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("café naïve")],
			[invocation("cafe naive")],
		);
		expect(result.overallScore).toBeGreaterThanOrEqual(0);
		expect(result.overallScore).toBeLessThanOrEqual(1);
	});

	it("treats hyphenated compounds as split tokens after punctuation strip", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("state-of-the-art model")],
			[invocation("state of the art model")],
		);
		expect(result.overallScore).toBe(1);
	});

	it("preserves per-invocation statuses independently of overall", async () => {
		const strict = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.9,
		});
		const result = await strict.evaluateInvocations(
			[invocation("exact match here"), invocation("partial shared")],
			[invocation("exact match here"), invocation("partial other")],
		);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].evalStatus).toBe(EvalStatus.FAILED);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it.each([
		{
			name: "single shared token among longer bags",
			actual: "alpha beta gamma",
			expected: "alpha delta epsilon",
		},
		{
			name: "response longer with full reference coverage",
			actual: "the quick brown fox jumps",
			expected: "quick fox",
		},
		{
			name: "reference longer with full response coverage",
			actual: "quick fox",
			expected: "the quick brown fox jumps",
		},
		{
			name: "mixed case and commas",
			actual: "Paris, France",
			expected: "paris france",
		},
		{
			name: "tabs and newlines collapsed via tokenization",
			actual: "one\ttwo\nthree",
			expected: "one two three",
		},
	])("table: $name", async ({ actual, expected }) => {
		const result = await evaluator.evaluateInvocations(
			[invocation(actual)],
			[invocation(expected)],
		);
		expect(result.perInvocationResults[0].score).toBeCloseTo(
			rougeF1(actual, expected),
		);
	});

	it("uses threshold 0 so any non-negative score passes overall", async () => {
		const zeroThreshold = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0,
		});
		const result = await zeroThreshold.evaluateInvocations(
			[invocation("no")],
			[invocation("overlap")],
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("uses threshold 1 so only perfect matches pass", async () => {
		const perfect = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 1,
		});
		const pass = await perfect.evaluateInvocations(
			[invocation("same")],
			[invocation("same")],
		);
		const fail = await perfect.evaluateInvocations(
			[invocation("almost same")],
			[invocation("same")],
		);
		expect(pass.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(fail.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("handles many invocations without dropping per-invocation rows", async () => {
		const n = 12;
		const actuals = Array.from({ length: n }, (_, i) =>
			invocation(i % 2 === 0 ? "shared token" : `unique-${i}`),
		);
		const expecteds = Array.from({ length: n }, (_, i) =>
			invocation(i % 2 === 0 ? "shared token" : `other-${i}`),
		);
		const result = await evaluator.evaluateInvocations(actuals, expecteds);
		expect(result.perInvocationResults).toHaveLength(n);
		expect(result.overallScore).toBeDefined();
		const evenScores = result.perInvocationResults
			.filter((_, i) => i % 2 === 0)
			.map((r) => r.score);
		expect(evenScores.every((s) => s === 1)).toBe(true);
	});

	it("content without parts yields empty extracted text (zero score)", async () => {
		const bare: Invocation = {
			userContent: { parts: [{ text: "hi" }] },
			creationTimestamp: 1,
			finalResponse: { role: "model" } as any,
		};
		const result = await evaluator.evaluateInvocations(
			[bare],
			[invocation("expected")],
		);
		expect(result.overallScore).toBe(0);
	});

	it("empty parts array yields empty extracted text", async () => {
		const emptyParts: Invocation = {
			userContent: { parts: [{ text: "hi" }] },
			creationTimestamp: 1,
			finalResponse: { role: "model", parts: [] },
		};
		const result = await evaluator.evaluateInvocations(
			[emptyParts],
			[invocation("expected")],
		);
		expect(result.overallScore).toBe(0);
	});

	it("throws when expected invocation is missing for an actual index", async () => {
		await expect(
			evaluator.evaluateInvocations(
				[invocation("a"), invocation("b")],
				[invocation("a")],
			),
		).rejects.toThrow();
	});
});
