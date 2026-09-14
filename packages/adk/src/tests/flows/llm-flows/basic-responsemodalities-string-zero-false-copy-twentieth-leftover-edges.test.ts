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

/**
 * Twentieth leftover: tenth leftover pins empty-array responseModalities as
 * truthy copy. String `"0"` / `"false"` also pass `if
 * (runConfig.responseModalities)` and are assigned onto liveConnectConfig.
 */
describe("basic responseModalities string-zero/false copy twentieth leftover", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("responseModalities $label is copied onto liveConnectConfig", async ({
		value,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "live-agent",
						canonicalModel: "gpt-4o",
					},
					runConfig: {
						responseModalities: value,
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.liveConnectConfig?.responseModalities).toBe(value);
	});

	it("falsy empty string leaves live field unset", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "live-agent",
						canonicalModel: "gpt-4o",
					},
					runConfig: {
						responseModalities: "",
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.liveConnectConfig?.responseModalities).toBeUndefined();
	});
});
