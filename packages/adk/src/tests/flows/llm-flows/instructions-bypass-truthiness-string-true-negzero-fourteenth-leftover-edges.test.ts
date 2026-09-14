import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor as instructionsProcessor } from "../../../flows/llm-flows/instructions";
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
		/* no events */
	}
}

/**
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `if (!bypassStateInjection)` residual — `"true"`/`[]`/`1` truthy skip inject;
 * `-0`/`NaN` falsy still inject.
 */
describe("instructions bypassStateInjection truthiness fourteenth leftover", () => {
	it.each([
		{ label: "string-true", bypass: "true" },
		{ label: "empty-array", bypass: [] },
		{ label: "1", bypass: 1 },
	])("bypass=$label is truthy so injectSessionState is skipped", async ({
		bypass,
		label,
	}) => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: "raw",
						rootAgent: { name: "root" },
						canonicalInstruction: async () =>
							[`body-${label}`, bypass] as [string, boolean],
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			`body-${label}`,
		);
		expect(llmRequest.getSystemInstructionText() ?? "").not.toContain(
			"injected:",
		);
	});

	it.each([
		{ label: "-0", bypass: -0 },
		{ label: "NaN", bypass: Number.NaN },
	])("bypass=$label is falsy so injectSessionState still runs", async ({
		bypass,
		label,
	}) => {
		vi.mocked(injectSessionState).mockClear();
		const llmRequest = new LlmRequest();
		await drain(
			instructionsProcessor.runAsync(
				{
					agent: {
						name: "child",
						canonicalModel: "gpt-4o",
						instruction: "raw",
						rootAgent: { name: "root" },
						canonicalInstruction: async () =>
							[`body-${label}`, bypass] as [string, boolean],
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).toHaveBeenCalledTimes(1);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			`injected:body-${label}`,
		);
	});
});
