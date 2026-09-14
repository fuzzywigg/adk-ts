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

describe("Identity description truthy leftovers after empty-string skip (tenth)", () => {
	it.each([
		"0",
		" ",
		"false",
		"null",
	])("description %j is truthy so the description clause is interpolated", async (description) => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").toContain(
			`The description about you is "${description}"`,
		);
	});

	it("empty description remains skipped (falsy if gate)", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description: "" },
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText() ?? "").not.toContain(
			"The description about you",
		);
	});
});
