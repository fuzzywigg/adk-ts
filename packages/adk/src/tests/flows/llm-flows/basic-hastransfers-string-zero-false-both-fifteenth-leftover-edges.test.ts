import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/basic";
import { LlmRequest } from "../../../models/llm-request";

const debugMock = vi.fn();

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: debugMock,
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events */
	}
}

/**
 * Fifteenth leftover (HEAVY tip-relaunch residual after tip #269 / 03ff90a8 after providers; supersedes closed #273/#262):
 * `hasTransfers` residual beyond fourteenth boolean `true` / POSITIVE_INFINITY —
 * both disallow `"0"` / `"false"` are truthy so `&&` blocks transfers → schema.
 */
describe("basic hasTransfers string-zero/false both fifteenth leftover", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("both disallow $label → hasTransfers false → schema applied", async ({
		value,
		label,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: `both-${label}`,
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: value,
						disallowTransferToPeers: value,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it('mixed "0" parent + false peers → transfers → schema skipped', async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "mixed-zero-false",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: "0",
						disallowTransferToPeers: false,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
		expect(debugMock).toHaveBeenCalled();
	});
});
