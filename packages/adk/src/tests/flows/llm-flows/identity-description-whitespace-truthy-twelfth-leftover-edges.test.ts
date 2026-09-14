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

describe("identity description truthy whitespace / 0 twelfth leftover", () => {
	it.each([
		{ label: "whitespace", description: " ", snippet: '" "' },
		{ label: "0 string", description: "0", snippet: '"0"' },
		{ label: "false string", description: "false", snippet: '"false"' },
	])("$label description is truthy so the clause is included", async ({
		description,
		snippet,
	}) => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "named", description },
				} as InvocationContext,
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain(`The description about you is ${snippet}`);
	});

	it("empty description remains skipped (falsy contrast)", async () => {
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
