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
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip 0e4d57c / #261, supersedes closed #262):
 * `if (agent.description)` residual beyond fourteenth `"true"` / `-Infinity` /
 * `{}` / `NaN` — string `"0"` / `"false"` are truthy and interpolate as-is.
 */
describe("identity description string-zero/false fifteenth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("description=$label interpolates the string sentinel", async ({
		value,
	}) => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: value as any },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			`The description about you is "${value}"`,
		);
	});
});
