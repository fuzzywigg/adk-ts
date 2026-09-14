import { describe, expect, it, vi } from "vitest";
import type { EvalCase } from "../../evaluation/eval-case";
import type { EvalSet } from "../../evaluation/eval-set";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { LocalEvalService } from "../../evaluation/local-eval-service";

function makeEvalSet(evalCase: EvalCase): EvalSet {
	return {
		evalSetId: "set-1",
		evalCases: [evalCase],
		creationTimestamp: 1,
	};
}

describe("LocalEvalService remainder edges (TOKENMAXX deepen)", () => {
	it("stores default parallelism of 4 when omitted", () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "ok",
		} as any);
		expect((service as any).parallelism).toBe(4);
	});

	it("stores an explicit parallelism override", () => {
		const service = new LocalEvalService(
			{ name: "stub", ask: async () => "ok" } as any,
			8,
		);
		expect((service as any).parallelism).toBe(8);
	});

	it("evaluateSession drains inference then evaluate end-to-end", async () => {
		const ask = vi.fn(async () => "hello world");
		const service = new LocalEvalService({
			name: "stub-agent",
			ask,
		} as any);

		const evalCase: EvalCase = {
			evalId: "caseE2E",
			conversation: [
				{
					invocationId: "ignored",
					userContent: { role: "user", parts: [{ text: "hi" }] },
					finalResponse: {
						role: "model",
						parts: [{ text: "hello world" }],
					},
					creationTimestamp: 1,
				},
			],
		};

		const results = [];
		for await (const result of service.evaluateSession({
			evalSetId: "set-1",
			evalCases: [makeEvalSet(evalCase)],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0.5,
					},
				],
			},
		})) {
			results.push(result);
		}

		expect(ask).toHaveBeenCalledOnce();
		expect(results.length).toBeGreaterThanOrEqual(1);
		expect(results[0].evalSetId).toContain("caseE2E");
		expect(results[0].evalCaseResults.length).toBeGreaterThanOrEqual(1);
		expect(
			results[0].evalCaseResults[0].evalMetricResultPerInvocation,
		).toBeDefined();
	});

	it("evaluateSession with empty evalCases yields nothing", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "x",
		} as any);

		const results = [];
		for await (const result of service.evaluateSession({
			evalSetId: "empty-set",
			evalCases: [],
			evaluateConfig: { evalMetrics: [] },
		})) {
			results.push(result);
		}

		expect(results).toEqual([]);
	});

	it("evaluateSession with metrics but empty inference batches yields nothing", async () => {
		const service = new LocalEvalService({
			name: "stub",
			ask: async () => "x",
		} as any);

		const emptySet: EvalSet = {
			evalSetId: "set-empty-cases",
			evalCases: [],
			creationTimestamp: 1,
		};

		const results = [];
		for await (const result of service.evaluateSession({
			evalSetId: "set-empty-cases",
			evalCases: [emptySet],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0.5,
					},
				],
			},
		})) {
			results.push(result);
		}

		expect(results).toEqual([]);
	});

	it("evaluateSession aggregates multiple cases into separate eval results", async () => {
		const ask = vi
			.fn()
			.mockResolvedValueOnce("alpha reply")
			.mockResolvedValueOnce("beta reply");
		const service = new LocalEvalService({
			name: "multi-agent",
			ask,
		} as any);

		const caseA: EvalCase = {
			evalId: "alpha",
			conversation: [
				{
					invocationId: "a0",
					userContent: { role: "user", parts: [{ text: "a" }] },
					finalResponse: {
						role: "model",
						parts: [{ text: "alpha reply" }],
					},
					creationTimestamp: 1,
				},
			],
		};
		const caseB: EvalCase = {
			evalId: "beta",
			conversation: [
				{
					invocationId: "b0",
					userContent: { role: "user", parts: [{ text: "b" }] },
					finalResponse: {
						role: "model",
						parts: [{ text: "beta reply" }],
					},
					creationTimestamp: 2,
				},
			],
		};

		const results = [];
		for await (const result of service.evaluateSession({
			evalSetId: "set-multi",
			evalCases: [
				{
					evalSetId: "set-multi",
					evalCases: [caseA, caseB],
					creationTimestamp: 1,
				},
			],
			evaluateConfig: {
				evalMetrics: [
					{
						metricName: PrebuiltMetrics.RESPONSE_MATCH_SCORE,
						threshold: 0.1,
					},
				],
			},
		})) {
			results.push(result);
		}

		expect(ask).toHaveBeenCalledTimes(2);
		expect(results.length).toBe(2);
		// evaluate() keys cases from result[0].invocationId (the expected row),
		// splitting on the last hyphen → `alpha-expected` / `beta-expected`.
		const evalSetIds = results.map((r) => r.evalSetId).sort();
		expect(evalSetIds).toEqual(["alpha-expected", "beta-expected"]);
	});

	it("uses ask agent path without AgentBuilder when ask is present", async () => {
		const ask = vi.fn(async () => "direct");
		const service = new LocalEvalService({
			name: "has-ask",
			ask,
		} as any);

		expect((service as any).runner).toBeDefined();
		expect((service as any).runner.ask).toBe(ask);
	});
});
