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
 * Fourteenth leftover residual deepen (complements #254 "true"/neginf/{}/NaN):
 * `if (agent.description)` residual stringify — `"Infinity"` keeps;
 * `Object(1)` → `"1"`; `Object(false)` → `"false"` (boxed false is truthy).
 */
describe("identity description string-infinity/object-one/object-false fourteenth residual deepen", () => {
	it('description="Infinity" interpolates string Infinity', async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: "Infinity" as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "Infinity"',
		);
	});

	it('description=Object(1) interpolates "1"', async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: Object(1) as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "1"',
		);
	});

	it('description=Object(false) interpolates "false"', async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: Object(false) as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			'The description about you is "false"',
		);
	});
});
