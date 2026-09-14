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
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `if (rootAgent.globalInstruction)` residual sibling of agent.instruction —
 * `true`/`"true"`/`[]` call canonicalGlobalInstruction; `-0` skips.
 */
describe("instructions globalInstruction true/string-true/negzero fourteenth leftover", () => {
	it.each([
		{ label: "true", value: true },
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
	])("globalInstruction=$label is truthy so canonicalGlobalInstruction runs", async ({
		value,
		label,
	}) => {
		vi.mocked(injectSessionState).mockClear();
		const canonicalGlobalInstruction = vi.fn(
			async () => [`global-from-${label}`, false] as [string, boolean],
		);
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
							canonicalGlobalInstruction,
						},
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(canonicalGlobalInstruction).toHaveBeenCalledTimes(1);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			`global-from-${label}`,
		);
	});

	it("globalInstruction=-0 is falsy so canonicalGlobalInstruction is never called", async () => {
		const canonicalGlobalInstruction = vi.fn(async () => [
			"should-not-run",
			false,
		]);
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
							globalInstruction: -0,
							canonicalGlobalInstruction,
						},
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(canonicalGlobalInstruction).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});
});
