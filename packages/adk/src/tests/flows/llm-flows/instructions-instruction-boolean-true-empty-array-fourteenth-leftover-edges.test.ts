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
 * Fourteenth leftover: `if (agent.instruction)` residual after tenth —
 * `true`/`"true"`/`[]` call canonicalInstruction; `-0` skips like falsy.
 */
describe("instructions instruction boolean-true/empty-array fourteenth leftover", () => {
	it.each([
		{ label: "true", value: true },
		{ label: "string-true", value: "true" },
		{ label: "empty-array", value: [] },
	])("instruction=$label is truthy so canonicalInstruction runs", async ({
		value,
		label,
	}) => {
		vi.mocked(injectSessionState).mockClear();
		const canonicalInstruction = vi.fn(
			async () => [`from-${label}`, false] as [string, boolean],
		);
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: value,
						rootAgent: { name: "root" },
						canonicalInstruction,
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(canonicalInstruction).toHaveBeenCalledTimes(1);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			`from-${label}`,
		);
	});

	it("instruction=-0 is falsy so canonicalInstruction is never called", async () => {
		const canonicalInstruction = vi.fn(async () => ["should-not-run", false]);
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: -0,
						rootAgent: { name: "root" },
						canonicalInstruction,
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(canonicalInstruction).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});
});
