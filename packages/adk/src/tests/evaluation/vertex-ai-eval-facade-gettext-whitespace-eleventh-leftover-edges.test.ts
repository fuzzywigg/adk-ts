import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Invocation } from "../../evaluation/eval-case";
import { PrebuiltMetrics } from "../../evaluation/eval-metrics";
import { VertexAiEvalFacade } from "../../evaluation/vertex-ai-eval-facade";

/**
 * Eleventh leftover: VertexAiEvalFacade `_getText` keeps whitespace/"0" after
 * `p.text || ""` + `length > 0`. Edges file covers undefined/""; whitespace
 * keep as dedicated leftover was not tip-burned. Distinct from #178 numSamples.
 */
describe("vertex-ai-eval-facade gettext whitespace keep eleventh leftover", () => {
	const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
	const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;

	beforeEach(() => {
		process.env.GOOGLE_CLOUD_PROJECT = "test-project";
		process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
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

	it("keeps whitespace and string 0 parts in prompt/reference/response", async () => {
		const perform = vi
			.spyOn(VertexAiEvalFacade as never, "_performEval")
			.mockResolvedValue({ summaryMetrics: [{ meanScore: 0.8 }] });

		const facade = new VertexAiEvalFacade({
			threshold: 0.5,
			metricName: PrebuiltMetrics.SAFETY_V1,
		});

		const expected: Invocation = {
			userContent: {
				parts: [{ text: " " }, { text: "" }, { text: "0" }, { text: "ask" }],
			},
			finalResponse: {
				parts: [{ text: "\t" }, { text: "ref" }],
			},
			creationTimestamp: 1,
		};
		const actual: Invocation = {
			userContent: { parts: [{ text: "u" }] },
			finalResponse: {
				parts: [{ text: "0" }, { text: "" }, { text: "act" }],
			},
			creationTimestamp: 1,
		};

		await facade.evaluateInvocations([actual], [expected]);

		expect(perform).toHaveBeenCalledWith(
			[
				{
					prompt: " \n0\nask",
					reference: "\t\nref",
					response: "0\nact",
				},
			],
			[PrebuiltMetrics.SAFETY_V1],
		);
	});
});
