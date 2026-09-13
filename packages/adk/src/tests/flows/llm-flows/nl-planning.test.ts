import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import {
	requestProcessor,
	responseProcessor,
} from "../../../flows/llm-flows/nl-planning";
import { LlmRequest } from "../../../models/llm-request";
import type { LlmResponse } from "../../../models/llm-response";
import { BuiltInPlanner } from "../../../planners/built-in-planner";
import { PlanReActPlanner } from "../../../planners/plan-re-act-planner";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeContext(
	overrides: Record<string, unknown> = {},
): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent: { name: "planner-agent" },
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
		...overrides,
	} as unknown as InvocationContext;
}

describe("nl-planning requestProcessor", () => {
	it("is a no-op when agent has no planner", async () => {
		const llmRequest = new LlmRequest();
		await drain(requestProcessor.runAsync(makeContext(), llmRequest));
		expect(llmRequest.config).toBeUndefined();
	});

	it("applies thinking config for BuiltInPlanner", async () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 64 };
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					agent: {
						name: "planner-agent",
						planner: new BuiltInPlanner({ thinkingConfig }),
					},
				}),
				llmRequest,
			),
		);

		expect((llmRequest.config as any).thinkingConfig).toEqual(thinkingConfig);
	});

	it("appends PlanReActPlanner instruction", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					agent: {
						name: "planner-agent",
						planner: new PlanReActPlanner(),
					},
				}),
				llmRequest,
			),
		);

		expect(llmRequest.config?.systemInstruction).toBeTruthy();
		expect(String(llmRequest.config?.systemInstruction)).toContain("PLANNING");
	});
});

describe("nl-planning responseProcessor", () => {
	it("is a no-op when agent has no planner", async () => {
		const llmResponse = {
			content: { role: "model", parts: [{ text: "hi" }] },
		} as LlmResponse;

		const events = await drain(
			responseProcessor.runAsync(makeContext(), llmResponse),
		);
		expect(events).toEqual([]);
	});

	it("yields a state-delta event when planner mutates state", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: (
				callbackContext: { state: Record<string, unknown> },
				parts: unknown[],
			) => {
				callbackContext.state.plan_step = "done";
				return parts;
			},
		};

		const llmResponse = {
			content: {
				role: "model",
				parts: [{ text: "/*PLANNING*/ step one" }],
			},
		} as LlmResponse;

		const events = await drain(
			responseProcessor.runAsync(
				makeContext({
					agent: { name: "planner-agent", planner },
				}),
				llmResponse,
			),
		);

		expect(events).toHaveLength(1);
		const event = events[0] as {
			actions: { stateDelta: Record<string, unknown> };
		};
		expect(event.actions.stateDelta.plan_step).toBe("done");
	});
});
