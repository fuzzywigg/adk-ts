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

	it("returns early when response content is empty", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: vi.fn(),
		};
		const events = await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				{ content: { role: "model", parts: [] } } as LlmResponse,
			),
		);
		expect(events).toEqual([]);
		expect(planner.processPlanningResponse).not.toHaveBeenCalled();
	});

	it("keeps original parts when processPlanningResponse returns falsy", async () => {
		const originalParts = [{ text: "keep me" }];
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: () => undefined,
		};
		const llmResponse = {
			content: { role: "model", parts: originalParts },
		} as LlmResponse;

		const events = await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				llmResponse,
			),
		);

		expect(events).toEqual([]);
		expect(llmResponse.content?.parts).toBe(originalParts);
	});

	it("does not yield when planner leaves state unchanged", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: (_ctx: unknown, parts: unknown[]) => parts,
		};
		const events = await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				{
					content: { role: "model", parts: [{ text: "stable" }] },
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});
});

describe("nl-planning requestProcessor thought stripping", () => {
	it("clears thought flags from request contents", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.contents = [
			{
				role: "user",
				parts: [{ text: "plan", thought: true } as any, { text: "ok" }],
			},
			{ role: "model", parts: undefined as any },
		];

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

		expect((llmRequest.contents[0].parts![0] as any).thought).toBeUndefined();
		expect(llmRequest.contents[0].parts![1]).toEqual({ text: "ok" });
	});

	it("falls back to PlanReActPlanner for non-shaped planner objects", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					agent: {
						name: "planner-agent",
						planner: { notAPlanner: true },
					},
				}),
				llmRequest,
			),
		);

		expect(String(llmRequest.config?.systemInstruction || "")).toContain(
			"PLANNING",
		);
	});

	it("is a no-op when planner property is null", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					agent: { name: "planner-agent", planner: null },
				}),
				llmRequest,
			),
		);
		expect(llmRequest.config).toBeUndefined();
	});

	it("skips thought stripping when contents are absent", async () => {
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
		expect(llmRequest.contents ?? []).toEqual([]);
		expect(String(llmRequest.config?.systemInstruction || "")).toContain(
			"PLANNING",
		);
	});

	it("skips appending when buildPlanningInstruction returns empty", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					agent: {
						name: "planner-agent",
						planner: {
							buildPlanningInstruction: () => "",
							processPlanningResponse: vi.fn(),
							applyThinkingConfig: vi.fn(),
						},
					},
				}),
				llmRequest,
			),
		);
		expect(llmRequest.config?.systemInstruction).toBeUndefined();
	});
});

describe("nl-planning responseProcessor more edges", () => {
	it("returns early for nullish responses", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: vi.fn(),
		};
		const events = await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				null as unknown as LlmResponse,
			),
		);
		expect(events).toEqual([]);
		expect(planner.processPlanningResponse).not.toHaveBeenCalled();
	});

	it("returns early when content parts are missing", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: vi.fn(),
		};
		const events = await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				{ content: { role: "model" } } as LlmResponse,
			),
		);
		expect(events).toEqual([]);
		expect(planner.processPlanningResponse).not.toHaveBeenCalled();
	});

	it("replaces response parts when planner returns new parts", async () => {
		const replacement = [{ text: "rewritten" }];
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: () => replacement,
		};
		const llmResponse = {
			content: { role: "model", parts: [{ text: "original" }] },
		} as LlmResponse;

		await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				llmResponse,
			),
		);

		expect(llmResponse.content?.parts).toBe(replacement);
	});

	it("yields state update with agent author and branch", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: (
				callbackContext: { state: Record<string, unknown> },
				parts: unknown[],
			) => {
				callbackContext.state.flag = true;
				return parts;
			},
		};
		const events = await drain(
			responseProcessor.runAsync(
				makeContext({
					invocationId: "inv-99",
					branch: "feature",
					agent: { name: "named-planner", planner },
				}),
				{
					content: { role: "model", parts: [{ text: "x" }] },
				} as LlmResponse,
			),
		);

		expect(events).toHaveLength(1);
		const event = events[0] as {
			author: string;
			branch?: string;
			invocationId: string;
		};
		expect(event.author).toBe("named-planner");
		expect(event.branch).toBe("feature");
		expect(event.invocationId).toBe("inv-99");
	});

	it("does not append instructions for BuiltInPlanner", async () => {
		const thinkingConfig = { includeThoughts: true, thinkingBudget: 32 };
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
		expect(llmRequest.config?.systemInstruction).toBeUndefined();
	});

	it("returns early when response content is absent entirely", async () => {
		const planner = {
			buildPlanningInstruction: vi.fn(),
			processPlanningResponse: vi.fn(),
		};
		const events = await drain(
			responseProcessor.runAsync(
				makeContext({ agent: { name: "planner-agent", planner } }),
				{ partial: false } as LlmResponse,
			),
		);
		expect(events).toEqual([]);
		expect(planner.processPlanningResponse).not.toHaveBeenCalled();
	});

	it("falls back to PlanReActPlanner for string planner values", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					agent: { name: "planner-agent", planner: "not-an-object" },
				}),
				llmRequest,
			),
		);

		expect(String(llmRequest.config?.systemInstruction || "")).toMatch(
			/PLANNING|plan/i,
		);
	});
});
