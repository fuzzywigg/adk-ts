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

	it("appends after existing system instructions", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.appendInstructions(["Be concise."]);
		await collect(
			requestProcessor.runAsync(
				{ agent: { name: "helper" } } as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text.startsWith("Be concise.")).toBe(true);
		expect(text).toContain('Your internal name is "helper"');
	});

	it("treats empty description as absent", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "blank", description: "" },
				} as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain('Your internal name is "blank"');
		expect(text).not.toContain("The description about you");
	});

	it("yields no events", async () => {
		const events = await collect(
			requestProcessor.runAsync(
				{ agent: { name: "silent" } } as InvocationContext,
				new LlmRequest(),
			),
		);
		expect(events).toEqual([]);
	});

	it("includes description with special characters and quotes", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{
					agent: {
						name: "quoted",
						description: 'Says "hello" & <bye>',
					},
				} as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain('Your internal name is "quoted"');
		expect(text).toContain(
			'The description about you is "Says "hello" & <bye>"',
		);
	});

	it("handles agent names with underscores and numbers", async () => {
		const llmRequest = new LlmRequest();
		await collect(
			requestProcessor.runAsync(
				{ agent: { name: "agent_v2" } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			'Your internal name is "agent_v2"',
		);
	});
});
