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
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * JSON.parse(JSON.stringify(...)). String `"0"` / `"false"` are truthy so the
 * branch runs and yields a string config (not `{}`).
 */
describe("basic generateContentConfig string-zero/false fifteenth residual deepen", () => {
	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("generateContentConfig $label becomes string config via JSON round-trip", async ({
		value,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "cfg-agent",
						canonicalModel: "gpt-4o",
						generateContentConfig: value,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config).toBe(value);
	});

	it("omitted generateContentConfig still yields empty object", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "cfg-agent",
						canonicalModel: "gpt-4o",
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config).toEqual({});
	});

	it("falsy null generateContentConfig still yields empty object", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "cfg-agent",
						canonicalModel: "gpt-4o",
						generateContentConfig: null,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config).toEqual({});
	});
});
