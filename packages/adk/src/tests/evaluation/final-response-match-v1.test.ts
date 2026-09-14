import type { Content, Part } from "@google/genai";
import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { EvalStatus } from "../../evaluation/evaluator";
import { RougeEvaluator } from "../../evaluation/final-response-match-v1";

function invocation(text?: string): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse:
			text !== undefined ? { role: "model", parts: [{ text }] } : undefined,
	};
}

function multiPartInvocation(parts: Part[]): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse: { role: "model", parts },
	};
}

function contentInvocation(finalResponse?: Content): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		finalResponse,
	};
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
		expect(info.description).toContain("Rouge_1");
		expect(info.description).toContain("[0,1]");
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

	it("scores partial unigram overlap with precision < recall via fmeasure", async () => {
		// response tokens {a,b,c}, reference {a} → precision 1/3, recall 1 → f=0.5
		const result = await evaluator.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a")],
		);

		expect(result.overallScore).toBeCloseTo(0.5);
		expect(result.perInvocationResults[0].score).toBeCloseTo(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores partial overlap with precision > recall via fmeasure", async () => {
		// response {a}, reference {a,b,c} → precision 1, recall 1/3 → f=0.5
		const result = await evaluator.evaluateInvocations(
			[invocation("a")],
			[invocation("a b c")],
		);

		expect(result.overallScore).toBeCloseTo(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("joins multi-part finalResponse text with newlines before scoring", async () => {
		const result = await evaluator.evaluateInvocations(
			[multiPartInvocation([{ text: "alpha" }, { text: "beta" }])],
			[multiPartInvocation([{ text: "alpha" }, { text: "beta" }])],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores multi-part vs single-part with the same tokens as a perfect match", async () => {
		const result = await evaluator.evaluateInvocations(
			[multiPartInvocation([{ text: "alpha" }, { text: "beta gamma" }])],
			[invocation("alpha beta gamma")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores whitespace-only response against non-empty reference as zero", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("   \t  ")],
			[invocation("meaningful reference")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores non-empty response against whitespace-only reference as zero", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("meaningful response")],
			[invocation("  \n ")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("passes when score equals the threshold exactly", async () => {
		const exact = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.5,
		});
		const result = await exact.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a")],
		);

		expect(result.overallScore).toBeCloseTo(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when score is just below threshold", async () => {
		const strict = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.51,
		});
		const result = await strict.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a")],
		);

		expect(result.overallScore).toBeCloseTo(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("ignores non-text parts when extracting content text", async () => {
		const withNoise = multiPartInvocation([
			{ inlineData: { data: "x", mimeType: "text/plain" } } as Part,
			{ text: "shared" },
			{ text: "" },
		]);
		const result = await evaluator.evaluateInvocations(
			[withNoise],
			[invocation("shared")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("collapses duplicate tokens via unigram sets before scoring", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("fox fox fox")],
			[invocation("fox")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores punctuation-only text as zero when no word tokens remain", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("!!! ???")],
			[invocation("hello")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("treats digits and underscores as word characters during tokenization", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("item_1 score_2")],
			[invocation("ITEM_1 SCORE_2")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("averages perfect and zero invocations to exactly 0.5", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("same"), invocation("zzz")],
			[invocation("same"), invocation("yyy")],
		);

		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("marks overall FAILED when the multi-invocation average is below threshold", async () => {
		const strict = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.75,
		});
		const result = await strict.evaluateInvocations(
			[invocation("same"), invocation("zzz")],
			[invocation("same"), invocation("yyy")],
		);

		expect(result.overallScore).toBe(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[1].evalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores missing expected finalResponse as zero", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("actual text")],
			[invocation()],
		);

		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores when both finalResponses are missing as zero", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation()],
			[invocation()],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores empty parts arrays as empty text", async () => {
		const result = await evaluator.evaluateInvocations(
			[contentInvocation({ role: "model", parts: [] })],
			[invocation("expected")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("scores content without parts as empty text", async () => {
		const result = await evaluator.evaluateInvocations(
			[contentInvocation({ role: "model" })],
			[invocation("expected")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("preserves actual and expected invocation references on results", async () => {
		const actual = invocation("alpha");
		const expected = invocation("alpha beta");
		const result = await evaluator.evaluateInvocations([actual], [expected]);

		expect(result.perInvocationResults[0].actualInvocation).toBe(actual);
		expect(result.perInvocationResults[0].expectedInvocation).toBe(expected);
	});

	it("passes a zero score when the threshold is 0", async () => {
		const permissive = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0,
		});
		const result = await permissive.evaluateInvocations(
			[invocation("zzz")],
			[invocation("yyy")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("requires a perfect score when the threshold is 1", async () => {
		const perfectOnly = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 1,
		});
		const partial = await perfectOnly.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a")],
		);
		const perfect = await perfectOnly.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a b c")],
		);

		expect(partial.overallScore).toBeCloseTo(0.5);
		expect(partial.overallEvalStatus).toBe(EvalStatus.FAILED);
		expect(perfect.overallScore).toBe(1);
		expect(perfect.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("computes fmeasure for two-of-three shared unigrams", async () => {
		// response {a,b,c}, reference {a,b,d} → common {a,b}
		// precision 2/3, recall 2/3 → f = 2/3
		const result = await evaluator.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a b d")],
		);

		expect(result.overallScore).toBeCloseTo(2 / 3);
		expect(result.perInvocationResults[0].score).toBeCloseTo(2 / 3);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("computes fmeasure for one-of-four shared unigrams", async () => {
		// response {w,x,y,z}, reference {w,a,b,c} → common {w}
		// precision 1/4, recall 1/4 → f = 0.25
		const strict = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.25,
		});
		const result = await strict.evaluateInvocations(
			[invocation("w x y z")],
			[invocation("w a b c")],
		);

		expect(result.overallScore).toBeCloseTo(0.25);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("normalizes mixed punctuation separators into the same token stream", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("one-two;three:four")],
			[invocation("one two three four")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("does not treat hyphenated forms as identical to spaced forms after tokenization", async () => {
		// "one-two" → tokens ["one", "two"]; "onetwo" → ["onetwo"] — different sets
		const result = await evaluator.evaluateInvocations(
			[invocation("one-two")],
			[invocation("onetwo")],
		);

		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("filters falsy text parts but keeps whitespace-only text parts in the join", async () => {
		const withWhitespacePart = multiPartInvocation([
			{ text: "alpha" },
			{ text: "   " },
			{ text: "beta" },
		]);
		const result = await evaluator.evaluateInvocations(
			[withWhitespacePart],
			[invocation("alpha beta")],
		);

		// Joined text is "alpha\n   \nbeta"; tokenize still yields {alpha, beta}
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores three invocations with exact overall average", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("same"), invocation("a b c"), invocation("zzz")],
			[invocation("same"), invocation("a"), invocation("yyy")],
		);

		expect(result.perInvocationResults).toHaveLength(3);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBeCloseTo(0.5);
		expect(result.perInvocationResults[2].score).toBe(0);
		expect(result.overallScore).toBeCloseTo((1 + 0.5 + 0) / 3);
	});

	it("uses the constructor threshold independently of getMetricInfo defaults", async () => {
		const custom = new RougeEvaluator({
			metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
			threshold: 0.9,
		});
		const result = await custom.evaluateInvocations(
			[invocation("a b c")],
			[invocation("a")],
		);

		expect(RougeEvaluator.getMetricInfo().metricName).toBe(
			PrebuiltMetrics.RESPONSE_MATCH_SCORE,
		);
		expect(result.overallScore).toBeCloseTo(0.5);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("matches when token order differs because scoring uses unordered unigram sets", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation("c b a")],
			[invocation("a b c")],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
