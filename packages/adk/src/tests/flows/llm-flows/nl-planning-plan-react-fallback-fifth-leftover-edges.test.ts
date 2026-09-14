import { describe, expect, it, vi } from "vitest";
import { requestProcessor as nlPlanningRequestProcessor } from "../../../flows/llm-flows/nl-planning";
import { LlmRequest } from "../../../models/llm-request";
import { PlanReActPlanner } from "../../../planners/plan-re-act-planner";

async function drain(gen: AsyncGenerator<unknown>) {
	for await (const _ of gen) {
		/* exhaust */
	}
}

function makeCtx(agent: Record<string, unknown>) {
	return {
		invocationId: "inv-nl",
		branch: "main",
		session: { id: "s", state: {}, events: [] },
		agent,
	} as any;
}

describe("nl-planning PlanReAct fallback / duck-type fifth leftover (post #165)", () => {
	it("falls back to PlanReActPlanner when planner lacks duck-type methods", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [{ text: "plan", thought: true } as any],
			},
		];

		await drain(
			nlPlanningRequestProcessor.runAsync(
				makeCtx({
					name: "agent",
					planner: { notAPlanner: true },
				}),
				llmRequest,
			),
		);

		// PlanReActPlanner.buildPlanningInstruction returns non-empty instruction
		expect(llmRequest.config?.systemInstruction).toBeDefined();
		expect((llmRequest.contents![0].parts![0] as any).thought).toBeUndefined();
	});

	it("returns early when planner property is falsy", async () => {
		for (const planner of [null, undefined, false, 0, ""] as const) {
			const llmRequest = new LlmRequest();
			await drain(
				nlPlanningRequestProcessor.runAsync(
					makeCtx({ name: "agent", planner }),
					llmRequest,
				),
			);
			expect(llmRequest.config?.systemInstruction).toBeUndefined();
		}
	});

	it("returns early when agent has no planner property", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			nlPlanningRequestProcessor.runAsync(
				makeCtx({ name: "agent" }),
				llmRequest,
			),
		);
		expect(llmRequest.config?.systemInstruction).toBeUndefined();
	});

	it("uses duck-typed planner methods without constructing PlanReActPlanner", async () => {
		const build = vi.fn().mockReturnValue("CUSTOM_PLAN");
		const process = vi.fn();
		const llmRequest = new LlmRequest();
		const appendSpy = vi.spyOn(llmRequest, "appendInstructions");

		await drain(
			nlPlanningRequestProcessor.runAsync(
				makeCtx({
					name: "agent",
					planner: {
						buildPlanningInstruction: build,
						processPlanningResponse: process,
					},
				}),
				llmRequest,
			),
		);

		expect(build).toHaveBeenCalled();
		expect(appendSpy).toHaveBeenCalledWith(["CUSTOM_PLAN"]);
		expect(process).not.toHaveBeenCalled();
	});

	it("real PlanReActPlanner instance is accepted via duck-type branch", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			nlPlanningRequestProcessor.runAsync(
				makeCtx({
					name: "agent",
					planner: new PlanReActPlanner(),
				}),
				llmRequest,
			),
		);
		expect(llmRequest.config?.systemInstruction).toBeDefined();
	});
});
