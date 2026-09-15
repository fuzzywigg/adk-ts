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
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #269 / 03ff90a8 after providers; supersedes closed #273/#262):
 * `if (!bypassStateInjection)` residual beyond fourteenth `"true"`/`[]`/`1` /
 * `-0`/`NaN` — string `"0"` / `"false"` are truthy so inject is skipped.
 */
describe("instructions bypass string-zero/false skip fifteenth leftover", () => {
	it.each([
		{ label: '"0"', bypass: "0" },
		{ label: '"false"', bypass: "false" },
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
});
