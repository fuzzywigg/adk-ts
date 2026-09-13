import { describe, expect, it } from "vitest";
import type { Part } from "@google/genai";
import type { CallbackContext } from "../../agents/callback-context";
import type { ReadonlyContext } from "../../agents/readonly-context";
import type { LlmRequest } from "../../models/llm-request";
import { BasePlanner } from "../../planners/base-planner";

class StubPlanner extends BasePlanner {
	buildPlanningInstruction(
		_readonlyContext: ReadonlyContext,
		_llmRequest: LlmRequest,
	): string | undefined {
		return "plan-instruction";
	}

	processPlanningResponse(
		_callbackContext: CallbackContext,
		responseParts: Part[],
	): Part[] | undefined {
		return responseParts.map((part) => ({ ...part, thought: true }));
	}
}

describe("BasePlanner", () => {
	it("allows subclasses to implement abstract planning methods", () => {
		const planner = new StubPlanner();
		const instruction = planner.buildPlanningInstruction(
			{} as ReadonlyContext,
			{} as LlmRequest,
		);
		expect(instruction).toBe("plan-instruction");

		const processed = planner.processPlanningResponse({} as CallbackContext, [
			{ text: "step" },
		]);
		expect(processed).toEqual([{ text: "step", thought: true }]);
	});
});
