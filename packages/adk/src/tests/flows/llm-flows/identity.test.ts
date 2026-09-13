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

describe("identity requestProcessor", () => {
	it("appends agent name to system instructions", async () => {
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: { name: "researcher" },
		} as InvocationContext;

		const events = await collect(
			requestProcessor.runAsync(invocationContext, llmRequest),
		);

		expect(events).toEqual([]);
		expect(llmRequest.getSystemInstructionText()).toContain(
			'Your internal name is "researcher"',
		);
		expect(llmRequest.getSystemInstructionText()).not.toContain(
			"The description about you",
		);
	});

	it("includes description when present", async () => {
		const llmRequest = new LlmRequest();
		const invocationContext = {
			agent: {
				name: "coder",
				description: "Writes TypeScript",
			},
		} as InvocationContext;

		await collect(requestProcessor.runAsync(invocationContext, llmRequest));

		const instruction = llmRequest.getSystemInstructionText() ?? "";
		expect(instruction).toContain('Your internal name is "coder"');
		expect(instruction).toContain(
			'The description about you is "Writes TypeScript"',
		);
	});
});
