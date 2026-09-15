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
 * Fourteenth leftover residual deepen (complements #254 true/"true"/[]/-0):
 * `if (rootAgent.globalInstruction)` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` call canonicalGlobalInstruction.
 */
describe("instructions globalInstruction string-infinity/object-one/object-false fourteenth residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
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
});
