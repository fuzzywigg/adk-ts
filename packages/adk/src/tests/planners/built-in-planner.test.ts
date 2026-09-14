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

	it("no-ops applyThinkingConfig when thinkingConfig is falsy", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: undefined as any,
		});
		const request = new LlmRequest();
		request.config = { temperature: 0.1 } as any;

		planner.applyThinkingConfig(request);

		expect(request.config).toEqual({ temperature: 0.1 });
		expect((request.config as any).thinkingConfig).toBeUndefined();
	});

	it("no-ops when thinkingConfig is undefined and leaves llmRequest.config untouched", () => {
		const planner = new BuiltInPlanner({
			thinkingConfig: { includeThoughts: true },
		});
		planner.thinkingConfig = undefined as any;

		const withConfig = new LlmRequest();
		withConfig.config = { temperature: 0.5, topP: 0.8 } as any;
		planner.applyThinkingConfig(withConfig);
		expect(withConfig.config).toEqual({ temperature: 0.5, topP: 0.8 });
		expect((withConfig.config as any).thinkingConfig).toBeUndefined();

		const bare = new LlmRequest();
		expect(bare.config).toBeUndefined();
		planner.applyThinkingConfig(bare);
		expect(bare.config).toBeUndefined();

		planner.thinkingConfig = null as any;
		const afterNull = new LlmRequest();
		afterNull.config = { maxOutputTokens: 16 } as any;
		planner.applyThinkingConfig(afterNull);
		expect(afterNull.config).toEqual({ maxOutputTokens: 16 });
		expect((afterNull.config as any).thinkingConfig).toBeUndefined();
	});
});
