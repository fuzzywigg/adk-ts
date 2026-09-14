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
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `if (agent.description)` residual stringify — `"true"` keeps; `NEGATIVE_INFINITY`
 * → `"-Infinity"`; `{}` → `"[object Object]"`; `NaN` falsy skip.
 */
describe("identity description string-true/neginf/object fourteenth leftover", () => {
	it('description="true" interpolates string true', async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: "true" as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "true"',
		);
	});

	it("description=NEGATIVE_INFINITY interpolates -Infinity", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: {
						name: "named",
						description: Number.NEGATIVE_INFINITY as any,
					},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "-Infinity"',
		);
	});

	it('description={} interpolates "[object Object]"', async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: {} as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "[object Object]"',
		);
	});

	it("description=NaN is falsy so the description clause is skipped", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: Number.NaN as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").not.toContain(
			"The description about you",
		);
	});
});
