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

describe("instructions if(agent.instruction) empty-string skip tenth leftover", () => {
	it("empty-string instruction is falsy so canonicalInstruction is never called", async () => {
		const canonicalInstruction = vi.fn(async () => ["should-not-run", false]);
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
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});

	it("whitespace instruction is truthy and is injected", async () => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: " ",
						rootAgent: { name: "root" },
						canonicalInstruction: async () => [" ", false] as [string, boolean],
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).toHaveBeenCalledTimes(1);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(" ");
	});
});
