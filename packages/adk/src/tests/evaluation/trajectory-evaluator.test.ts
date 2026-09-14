import { describe, expect, it } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { TrajectoryEvaluator } from "../../evaluation/trajectory-evaluator";
import { EvalStatus } from "../../evaluation/evaluator";

function invocation(toolUses?: Invocation["intermediateData"]): Invocation {
	return {
		userContent: { parts: [{ text: "hi" }] },
		creationTimestamp: 1,
		intermediateData: toolUses,
	};
}

describe("TrajectoryEvaluator", () => {
	const evaluator = new TrajectoryEvaluator({
		metricName: "tool_trajectory_avg_score",
		threshold: 1,
	});

	it("exposes metric info", () => {
		const info = TrajectoryEvaluator.getMetricInfo();
		expect(info.metricName).toBe("tool_trajectory_avg_score");
		expect(info.metricValueInfo.interval?.minValue).toBe(0);
		expect(info.metricValueInfo.interval?.maxValue).toBe(1);
	});

	it("scores perfect tool trajectory matches as passed", async () => {
		const tools = {
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		};
		const result = await evaluator.evaluateInvocations(
			[invocation(tools)],
			[invocation(tools)],
		);

		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[0].evalStatus).toBe(EvalStatus.PASSED);
	});

	it("scores mismatched names or args as failed", async () => {
		const actual = invocation({
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { q: "other" } }],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("marks invocations without tool uses as not evaluated", async () => {
		const result = await evaluator.evaluateInvocations(
			[invocation(undefined)],
			[invocation(undefined)],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("fails when actual args are only a partial match", async () => {
		const actual = invocation({
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { q: "adk", limit: 5 } }],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("fails when actual has an extra tool use", async () => {
		const actual = invocation({
			toolUses: [
				{ name: "search", args: { q: "adk" } },
				{ name: "fetch", args: { url: "https://example.com" } },
			],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("fails when actual is missing a tool use", async () => {
		const actual = invocation({
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [
				{ name: "search", args: { q: "adk" } },
				{ name: "summarize", args: {} },
			],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.perInvocationResults[0].score).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("averages scores across multiple invocations", async () => {
		const match = {
			toolUses: [{ name: "search", args: { q: "ok" } }],
			intermediateResponses: [],
		};
		const mismatchActual = invocation({
			toolUses: [{ name: "search", args: { q: "wrong" } }],
			intermediateResponses: [],
		});
		const mismatchExpected = invocation({
			toolUses: [{ name: "search", args: { q: "right" } }],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations(
			[invocation(match), mismatchActual],
			[invocation(match), mismatchExpected],
		);

		expect(result.overallScore).toBe(0.5);
		expect(result.perInvocationResults).toHaveLength(2);
		expect(result.perInvocationResults[0].score).toBe(1);
		expect(result.perInvocationResults[1].score).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("treats missing args as empty objects and passes below-1 thresholds", async () => {
		const soft = new TrajectoryEvaluator({
			metricName: "tool_trajectory_avg_score",
			threshold: 0.5,
		});
		const tools = {
			toolUses: [{ name: "noop" }, { name: "noop", args: {} }],
			intermediateResponses: [],
		};
		const result = await soft.evaluateInvocations(
			[invocation(tools)],
			[invocation(tools)],
		);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when tool names differ even if args match", async () => {
		const actual = invocation({
			toolUses: [{ name: "a", args: { x: 1 } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "b", args: { x: 1 } }],
			intermediateResponses: [],
		});
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.perInvocationResults[0].score).toBe(0);
	});

	it("compares nested object args via JSON.stringify equality", async () => {
		const tools = {
			toolUses: [
				{
					name: "write",
					args: { payload: { nested: { a: 1, b: ["x"] }, flag: true } },
				},
			],
			intermediateResponses: [],
		};
		const mismatch = {
			toolUses: [
				{
					name: "write",
					args: { payload: { nested: { a: 1, b: ["y"] }, flag: true } },
				},
			],
			intermediateResponses: [],
		};

		const match = await evaluator.evaluateInvocations(
			[invocation(tools)],
			[invocation(tools)],
		);
		expect(match.overallScore).toBe(1);

		const miss = await evaluator.evaluateInvocations(
			[invocation(tools)],
			[invocation(mismatch)],
		);
		expect(miss.overallScore).toBe(0);
	});

	it("treats arg key order as significant after sorting keys", async () => {
		const actual = invocation({
			toolUses: [{ name: "search", args: { b: 2, a: 1 } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { a: 1, b: 2 } }],
			intermediateResponses: [],
		});

		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("marks empty toolUses arrays as evaluated equals, missing as NOT_EVALUATED", async () => {
		const empty = {
			toolUses: [],
			intermediateResponses: [],
		};
		const emptyResult = await evaluator.evaluateInvocations(
			[invocation(empty)],
			[invocation(empty)],
		);
		expect(emptyResult.perInvocationResults[0].score).toBe(1);
		expect(emptyResult.overallEvalStatus).toBe(EvalStatus.PASSED);

		const oneMissing = await evaluator.evaluateInvocations(
			[invocation(empty)],
			[invocation(undefined)],
		);
		expect(oneMissing.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(oneMissing.overallScore).toBe(0);
	});

	it("averages only evaluated invocations when mixing NOT_EVALUATED rows", async () => {
		const match = {
			toolUses: [{ name: "search", args: { q: "ok" } }],
			intermediateResponses: [],
		};
		const result = await evaluator.evaluateInvocations(
			[invocation(undefined), invocation(match)],
			[invocation(undefined), invocation(match)],
		);

		expect(result.perInvocationResults[0].evalStatus).toBe(
			EvalStatus.NOT_EVALUATED,
		);
		expect(result.perInvocationResults[1].score).toBe(1);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when sorted arg key sets differ by name", async () => {
		const actual = invocation({
			toolUses: [{ name: "search", args: { q: "adk" } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { query: "adk" } }],
			intermediateResponses: [],
		});
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
	});

	it("passes empty tool trajectories as a perfect match", async () => {
		const empty = invocation({
			toolUses: [],
			intermediateResponses: [],
		});
		const result = await evaluator.evaluateInvocations([empty], [empty]);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});

	it("fails when tool counts differ even if names overlap", async () => {
		const actual = invocation({
			toolUses: [
				{ name: "search", args: { q: "a" } },
				{ name: "search", args: { q: "b" } },
			],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "search", args: { q: "a" } }],
			intermediateResponses: [],
		});
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(0);
		expect(result.overallEvalStatus).toBe(EvalStatus.FAILED);
	});

	it("matches tools when arg values are deeply equal objects", async () => {
		const actual = invocation({
			toolUses: [{ name: "write", args: { meta: { a: 1, b: [2] } } }],
			intermediateResponses: [],
		});
		const expected = invocation({
			toolUses: [{ name: "write", args: { meta: { a: 1, b: [2] } } }],
			intermediateResponses: [],
		});
		const result = await evaluator.evaluateInvocations([actual], [expected]);
		expect(result.overallScore).toBe(1);
		expect(result.overallEvalStatus).toBe(EvalStatus.PASSED);
	});
});
