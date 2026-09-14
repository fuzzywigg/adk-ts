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

describe("IdentityLlmRequestProcessor fifth leftover edges (post #146)", () => {
	it("repeated runAsync accumulates duplicate identity instruction blocks", async () => {
		const llmRequest = new LlmRequest();
		const context = {
			agent: { name: "dup", description: "twice" },
		} as InvocationContext;

		await collect(requestProcessor.runAsync(context, llmRequest));
		await collect(requestProcessor.runAsync(context, llmRequest));

		const text = llmRequest.getSystemInstructionText() ?? "";
		const nameHits = text.match(/Your internal name is "dup"/g) ?? [];
		const descHits = text.match(/The description about you is "twice"/g) ?? [];
		expect(nameHits).toHaveLength(2);
		expect(descHits).toHaveLength(2);
	});

	it("preserves backticks and newlines inside description", async () => {
		const llmRequest = new LlmRequest();
		const description = "Uses `code` and\nmulti-line\nnotes";
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "special", description },
				} as InvocationContext,
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain('The description about you is "Uses `code` and');
		expect(text).toContain("multi-line");
		expect(text).toContain('notes"');
	});

	it("agent with only name omits description clause", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "name_only" },
				} as InvocationContext,
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain('Your internal name is "name_only"');
		expect(text).not.toContain("The description about you");
	});

	it("empty description string is falsy so description clause is skipped", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "empty_desc", description: "" },
				} as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.getSystemInstructionText() ?? "").not.toContain(
			"The description about you",
		);
	});

	it("empty generator contract yields no events", async () => {
		const events = await collect(
			requestProcessor.runAsync(
				{ agent: { name: "quiet" } } as InvocationContext,
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});
});
