import { describe, expect, it, vi } from "vitest";
import { requestProcessor as identityRequestProcessor } from "../../../flows/llm-flows/identity";
import { LlmRequest } from "../../../models/llm-request";
import type { InvocationContext } from "../../../agents/invocation-context";

vi.mock("@adk/logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

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
 * Twelfth leftover: identity always interpolates `agent.name` (no truthiness
 * gate). Composition leftover pins description omit vs whitespace, not empty
 * vs space *name*.
 */
describe("identity agent name empty vs whitespace twelfth leftover", () => {
	it('empty name interpolates as Your internal name is ""', async () => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: "", description: "" } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			'Your internal name is ""',
		);
		expect(llmRequest.getSystemInstructionText()).not.toContain(
			"The description about you",
		);
	});

	it("whitespace name is kept inside quotes", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: " ", description: "" } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			'Your internal name is " "',
		);
	});

	it("falsy numeric name 0 stringifies as 0", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			identityRequestProcessor.runAsync(
				{ agent: { name: 0 as any } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			'Your internal name is "0"',
		);
	});
});
