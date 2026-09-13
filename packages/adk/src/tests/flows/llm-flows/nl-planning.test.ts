import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import {
	requestProcessor,
	responseProcessor,
} from "../../../flows/llm-flows/nl-planning";
import { LlmRequest } from "../../../models/llm-request";
import { LlmResponse } from "../../../models/llm-response";
import { PlanReActPlanner } from "../../../planners/plan-re-act-planner";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* drain */
	}
}

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

function makeContext(agent: Record<string, unknown>): InvocationContext {
	return {
		invocationId: "inv-1",
		branch: "main",
		agent,
		session: {
			id: "s1",
			appName: "app",
			userId: "u1",
			state: {},
			events: [],
			lastUpdateTime: 0,
		},
	} as unknown as InvocationContext;
}

describe("nl-planning processors", () => {
	it("requestProcessor is a no-op without planner", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(makeContext({ name: "agent" }), llmRequest),
		);
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});

	it("responseProcessor is a no-op without planner", async () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "/*PLANNING*/ plan /*FINAL_ANSWER*/ done" }],
			},
		});
		const events = await collect(
			responseProcessor.runAsync(makeContext({ name: "agent" }), response),
		);
		expect(events).toEqual([]);
		expect(response.content?.parts).toHaveLength(1);
	});

	it("requestProcessor appends instructions with PlanReActPlanner", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				makeContext({
					name: "planner-agent",
					planner: new PlanReActPlanner(),
				}),
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("/*PLANNING*/");
		expect(text).toContain("/*ACTION*/");
	});

	it("responseProcessor processes planning response with PlanReActPlanner", async () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "/*PLANNING*/ step /*FINAL_ANSWER*/ the answer" }],
			},
		});

		await collect(
			responseProcessor.runAsync(
				makeContext({
					name: "planner-agent",
					planner: new PlanReActPlanner(),
				}),
				response,
			),
		);

		expect(response.content?.parts?.length).toBeGreaterThan(1);
		expect(response.content?.parts?.some((p) => p.thought === true)).toBe(true);
	});
});
