import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

describe("BuiltInPlanner", () => {
	it("applies thinking config onto the llm request", () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 128 };
		const planner = new BuiltInPlanner({ thinkingConfig });
		const request = new LlmRequest();

		planner.applyThinkingConfig(request);

		expect((request.config as any).thinkingConfig).toEqual(thinkingConfig);
	});

	it("preserves existing llmRequest.config keys when applying thinking config", () => {
		const thinkingConfig = { includeThoughts: false, thinkingBudget: 32 };
		const planner = new BuiltInPlanner({ thinkingConfig });
		const request = new LlmRequest();
		request.config = { temperature: 0.2, topP: 0.9 } as any;

		planner.applyThinkingConfig(request);

		expect(request.config).toMatchObject({
			temperature: 0.2,
			topP: 0.9,
			thinkingConfig,
		});
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

	it("exposes the thinkingConfig passed to the constructor", () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 64 };
		const planner = new BuiltInPlanner({ thinkingConfig });
		expect(planner.thinkingConfig).toEqual(thinkingConfig);
	});

	it("initializes llmRequest.config when it was previously undefined", () => {
		const thinkingConfig = { includeThoughts: true };
		const planner = new BuiltInPlanner({ thinkingConfig });
		const request = new LlmRequest();
		expect(request.config).toBeUndefined();

		planner.applyThinkingConfig(request);

		expect(request.config).toEqual({ thinkingConfig });
	});
});
