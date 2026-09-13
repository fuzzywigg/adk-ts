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
});
