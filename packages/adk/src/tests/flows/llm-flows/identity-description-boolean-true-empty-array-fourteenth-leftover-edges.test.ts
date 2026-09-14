import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/identity";
import { LlmRequest } from "../../../models/llm-request";

async function collect(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<unknown[]> {
	const items: unknown[] = [];
	for await (const item of gen) {
		items.push(item);
	}
	return items;
}

/**
 * Fourteenth leftover: `if (agent.description)` residual after tenth/twelfth —
 * boolean `true` → `"true"`; `[]` → `""`; `-0` → `"0"`; falsy skip contrast.
 */
describe("identity description boolean-true/empty-array fourteenth leftover", () => {
	it("description=true interpolates stringified true", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: true as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "true"',
		);
	});

	it("description=[] is truthy and stringifies to empty", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: [] as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain('The description about you is ""');
	});

	it("description=-0 is falsy so the description clause is skipped", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: -0 as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").not.toContain(
			"The description about you",
		);
	});

	it("description=0 is falsy so the description clause is skipped", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: 0 as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").not.toContain(
			"The description about you",
		);
	});
});
