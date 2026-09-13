import { describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import {
	requestProcessor,
	responseProcessor,
} from "../../../flows/llm-flows/code-execution";
import { LlmRequest } from "../../../models/llm-request";
import { LlmResponse } from "../../../models/llm-response";

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
	it("exports requestProcessor and responseProcessor", () => {
		expect(requestProcessor).toBeDefined();
		expect(typeof requestProcessor.runAsync).toBe("function");
		expect(responseProcessor).toBeDefined();
		expect(typeof responseProcessor.runAsync).toBe("function");
	});

	it("requestProcessor no-ops when agent has no codeExecutor", async () => {
		const llmRequest = new LlmRequest();
		llmRequest.contents = [{ role: "user", parts: [{ text: "hello" }] }];
		const context = {
			agent: { name: "plain-agent" },
		} as InvocationContext;

		const events = await collect(
			requestProcessor.runAsync(context, llmRequest),
		);

		expect(events).toEqual([]);
		expect(llmRequest.contents).toEqual([
			{ role: "user", parts: [{ text: "hello" }] },
		]);
	});

	it("responseProcessor no-ops when agent has no codeExecutor", async () => {
		const response = new LlmResponse({
			content: {
				role: "model",
				parts: [{ text: "```python\nprint(1)\n```" }],
			},
		});
		const context = {
			agent: { name: "plain-agent" },
			invocationId: "inv-1",
			session: { state: {} },
		} as unknown as InvocationContext;

		const events = await collect(responseProcessor.runAsync(context, response));

		expect(events).toEqual([]);
		expect(response.content?.parts?.[0].text).toContain("print(1)");
	});
});
