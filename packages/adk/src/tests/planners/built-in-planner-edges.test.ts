import { describe, expect, it } from "vitest";
import { LlmRequest } from "../../models/llm-request";
import { BuiltInPlanner } from "../../planners/built-in-planner";

describe("BuiltInPlanner edges", () => {
	describe("applyThinkingConfig config || {}", () => {
		it("initializes llmRequest.config when undefined via config || {}", () => {
			const thinkingConfig = { includeThoughts: true, thinkingBudget: 64 };
			const planner = new BuiltInPlanner({ thinkingConfig });
			const request = new LlmRequest();
			expect(request.config).toBeUndefined();

			planner.applyThinkingConfig(request);

			expect(request.config).toEqual({ thinkingConfig });
		});

		it("preserves existing config keys while applying thinkingConfig", () => {
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

		it("overwrites an existing thinkingConfig on the request", () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true, thinkingBudget: 256 },
			});
			const request = new LlmRequest();
			request.config = {
				thinkingConfig: { includeThoughts: false, thinkingBudget: 8 },
			} as any;

			planner.applyThinkingConfig(request);

			expect((request.config as any).thinkingConfig).toEqual({
				includeThoughts: true,
				thinkingBudget: 256,
			});
		});

		it("applies empty-object thinkingConfig because it is truthy", () => {
			const planner = new BuiltInPlanner({ thinkingConfig: {} as any });
			const request = new LlmRequest();
			planner.applyThinkingConfig(request);
			expect(request.config).toEqual({ thinkingConfig: {} });
		});

		it("no-ops when thinkingConfig is falsy and leaves config untouched", () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: true },
			});
			planner.thinkingConfig = undefined as any;

			const withConfig = new LlmRequest();
			withConfig.config = { temperature: 0.5 } as any;
			planner.applyThinkingConfig(withConfig);
			expect(withConfig.config).toEqual({ temperature: 0.5 });
			expect((withConfig.config as any).thinkingConfig).toBeUndefined();

			const bare = new LlmRequest();
			expect(bare.config).toBeUndefined();
			planner.applyThinkingConfig(bare);
			expect(bare.config).toBeUndefined();
		});

		it("is idempotent when called twice on the same request", () => {
			const thinkingConfig = { includeThoughts: true, thinkingBudget: 16 };
			const planner = new BuiltInPlanner({ thinkingConfig });
			const request = new LlmRequest();
			planner.applyThinkingConfig(request);
			planner.applyThinkingConfig(request);
			expect(request.config).toEqual({ thinkingConfig });
		});
	});

	describe("planning hooks always undefined", () => {
		it("buildPlanningInstruction returns undefined", () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: false },
			});
			expect(
				planner.buildPlanningInstruction({} as any, new LlmRequest()),
			).toBeUndefined();
		});

		it("processPlanningResponse returns undefined", () => {
			const planner = new BuiltInPlanner({
				thinkingConfig: { includeThoughts: false },
			});
			expect(
				planner.processPlanningResponse({} as any, [{ text: "plan" }]),
			).toBeUndefined();
		});
	});
});
