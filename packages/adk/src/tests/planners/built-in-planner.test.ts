import { describe, expect, it } from "vitest";
import { BuiltInPlanner } from "../../planners/built-in-planner";
import { LlmRequest } from "../../models/llm-request";

describe("BuiltInPlanner", () => {
	it("applies thinking config onto the llm request", () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 128 };
		const planner = new BuiltInPlanner({ thinkingConfig });
		const request = new LlmRequest();

		planner.applyThinkingConfig(request);

		expect((request.config as any).thinkingConfig).toEqual(thinkingConfig);
	});

	it("does not provide custom planning instructions or response processing", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: false },
		});

		expect(
			planner.buildPlanningInstruction({} as any, new LlmRequest()),
		).toBeUndefined();
		expect(
			planner.processPlanningResponse({} as any, [{ text: "plan" }]),
		).toBeUndefined();
	});
});
