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
 * Fourteenth leftover residual deepen (complements #254 "true"/[]/1/-0/NaN):
 * `if (!bypassStateInjection)` — string `"Infinity"` / `Object(1)` /
 * `Object(false)` truthy skip inject (boxed false ≠ bare false inject path).
 */
describe("instructions bypassStateInjection string-infinity/object-one/object-false fourteenth residual deepen", () => {
	it.each([
		{ label: 'string "Infinity"', bypass: "Infinity" },
		{ label: "Object(1)", bypass: Object(1) },
		{ label: "Object(false)", bypass: Object(false) },
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
