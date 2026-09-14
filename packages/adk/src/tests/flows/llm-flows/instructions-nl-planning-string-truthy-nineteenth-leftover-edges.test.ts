import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as instructionsProcessor } from "../../../flows/llm-flows/instructions";
import { requestProcessor as nlPlanningRequestProcessor } from "../../../flows/llm-flows/nl-planning";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../utils/instructions-utils", () => ({
	injectSessionState: vi.fn(
		async (instruction: string) => `injected:${instruction}`,
	),
}));

import { injectSessionState } from "../../../utils/instructions-utils";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
	}
}

/**
 * Nineteenth leftover (flows residual): `if (agent.instruction)` truthy string
 * gates + `!agent.planner` falsy vs string-truthy PlanReAct fallback.
 */
describe("instructions/nl-planning string-truthy gates nineteenth leftover", () => {
	it.each([
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("instruction $label is truthy and injected", async ({ value }) => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "a",
						canonicalModel: "gpt-4o",
						instruction: value,
						canonicalInstruction: async () =>
							[value, false] as [string, boolean],
					},
					session: { state: {} },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toContain(
			`injected:${value}`,
		);
	});

	it('canonicalInstruction bypass "0" is truthy so !bypass skips inject', async () => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "a",
						canonicalModel: "gpt-4o",
						instruction: "hello",
						canonicalInstruction: async () => ["hello", "0"] as [string, any],
					},
					session: { state: {} },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toContain("hello");
	});

	it.each([
		{ label: "0", value: 0 },
		{ label: "empty-string", value: "" },
		{ label: "false", value: false },
	])("planner=$label is falsy so no planning append", async ({ value }) => {
		const llmRequest = new LlmRequest();
		await drain(
			nlPlanningRequestProcessor.runAsync(
				{
					agent: {
						name: "planner-agent",
						canonicalModel: "gpt-4o",
						planner: value,
					},
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).not.toMatch(/PLANNING|plan/i);
	});

	it.each([
		{ label: "string-zero", value: "0" },
		{ label: "string-false", value: "false" },
	])("planner=$label is truthy non-object → PlanReAct fallback instructions", async ({
		value,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			nlPlanningRequestProcessor.runAsync(
				{
					agent: {
						name: "planner-agent",
						canonicalModel: "gpt-4o",
						planner: value,
					},
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text.length).toBeGreaterThan(0);
	});
});
