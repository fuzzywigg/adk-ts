import { describe, expect, it, vi } from "vitest";
import { LlmAgent } from "../../../agents/llm-agent";
import type { InvocationContext } from "../../../agents/invocation-context";
import { BuiltInCodeExecutor } from "../../../code-executors/built-in-code-executor";
import {
	requestProcessor,
	responseProcessor,
} from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import type { LlmResponse } from "../../../models/llm-response";

vi.mock("../../../logger", () => ({
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

describe("code-execution processors", () => {
	it("requestProcessor skips agents without codeExecutor", async () => {
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		const events = await collect(
			requestProcessor.runAsync(
				{
					agent: { name: "plain" },
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toBeUndefined();
	});

	it("requestProcessor skips duck-typed agents that are not LlmAgent", async () => {
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });
		const events = await collect(
			requestProcessor.runAsync(
				{
					agent: {
						name: "duck",
						codeExecutor: new BuiltInCodeExecutor(),
					},
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toBeUndefined();
	});

	it("requestProcessor configures BuiltInCodeExecutor for gemini-2 models", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gemini-2.0-flash",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({ model: "gemini-2.0-flash" });

		const events = await collect(
			requestProcessor.runAsync(
				{
					agent,
					session: { state: {}, events: [], id: "s1" },
					invocationId: "inv-1",
				} as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(events).toEqual([]);
		expect(llmRequest.config?.tools).toEqual(
			expect.arrayContaining([expect.objectContaining({ codeExecution: {} })]),
		);
	});

	it("requestProcessor rejects BuiltInCodeExecutor for non-gemini-2 models", async () => {
		const agent = new LlmAgent({
			name: "coder",
			model: "gpt-4o",
			codeExecutor: new BuiltInCodeExecutor(),
		});
		const llmRequest = new LlmRequest({ model: "gpt-4o" });

		await expect(
			collect(
				requestProcessor.runAsync(
					{
						agent,
						session: { state: {}, events: [], id: "s1" },
						invocationId: "inv-1",
					} as unknown as InvocationContext,
					llmRequest,
				),
			),
		).rejects.toThrow(/not supported for model gpt-4o/);
	});

	it("responseProcessor skips partial responses", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						codeExecutor: new BuiltInCodeExecutor(),
					}),
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				{
					partial: true,
					content: { role: "model", parts: [{ text: "x" }] },
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});

	it("responseProcessor is a no-op for BuiltInCodeExecutor", async () => {
		const events = await collect(
			responseProcessor.runAsync(
				{
					agent: new LlmAgent({
						name: "coder",
						codeExecutor: new BuiltInCodeExecutor(),
					}),
					session: { state: {}, events: [] },
				} as unknown as InvocationContext,
				{
					partial: false,
					content: {
						role: "model",
						parts: [{ text: "```python\nprint(1)\n```" }],
					},
				} as LlmResponse,
			),
		);
		expect(events).toEqual([]);
	});
});
