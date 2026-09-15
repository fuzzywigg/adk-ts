import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as instructionsProcessor } from "../../../flows/llm-flows/instructions";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../utils/instructions-utils", () => ({
	injectSessionState: vi.fn(async (instruction: string) => instruction),
}));

import { injectSessionState } from "../../../utils/instructions-utils";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events */
	}
}

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip 0e4d57c / #261, supersedes closed #262): tenth leftover pins empty-string instruction skip and
 * whitespace inject. String `"0"` / `"false"` are truthy so
 * `if (agent.instruction)` / `if (rootAgent.globalInstruction)` inject.
 */
describe("instructions string-zero/false inject fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("agent.instruction $label is injected", async ({ value, label }) => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: value,
						rootAgent: { name: "root" },
						canonicalInstruction: async () =>
							[value, false] as [string, boolean],
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).toHaveBeenCalledTimes(1);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(value);
		expect(label).toBeTruthy();
	});

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("rootAgent.globalInstruction $label is injected", async ({ value }) => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						rootAgent: {
							name: "root",
							canonicalModel: "gpt-4o",
							globalInstruction: value,
							canonicalGlobalInstruction: async () =>
								[value, false] as [string, boolean],
						},
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).toHaveBeenCalledTimes(1);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(value);
	});

	it("empty instruction still skips (tenth control)", async () => {
		vi.mocked(injectSessionState).mockClear();
		const canonicalInstruction = vi.fn(async () => ["nope", false]);
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: "",
						rootAgent: { name: "root" },
						canonicalInstruction,
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(canonicalInstruction).not.toHaveBeenCalled();
		expect(injectSessionState).not.toHaveBeenCalled();
	});
});
