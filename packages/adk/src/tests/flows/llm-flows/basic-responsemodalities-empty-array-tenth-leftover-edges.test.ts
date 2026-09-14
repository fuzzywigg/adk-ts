import { describe, expect, it } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/basic";
import { LlmRequest } from "../../../models/llm-request";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events */
	}
}

describe("BasicLlmRequestProcessor responseModalities empty-array truthiness tenth leftover", () => {
	it("empty array is truthy so liveConnectConfig copies [] (unlike omitted)", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "live-agent",
						canonicalModel: "gpt-4o",
					},
					runConfig: {
						responseModalities: [],
					},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.liveConnectConfig?.responseModalities).toEqual([]);
	});

	it("omitted responseModalities leaves the live field unset", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "live-agent",
						canonicalModel: "gpt-4o",
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.liveConnectConfig?.responseModalities).toBeUndefined();
	});
});
