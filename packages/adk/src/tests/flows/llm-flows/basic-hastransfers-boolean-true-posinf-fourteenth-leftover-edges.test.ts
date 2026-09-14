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
 * Fourteenth leftover (HEAVY tip-relaunch residual after #243):
 * `hasTransfers` residual beyond string-true/`[]`/`-0` — both boolean `true`
 * blocks schema; mixed true+false still transfers; both POSITIVE_INFINITY blocks.
 */
describe("basic hasTransfers boolean-true/posinf fourteenth leftover", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it("both disallow boolean true → hasTransfers false → schema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-bool-true",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: true,
						disallowTransferToPeers: true,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it("mixed boolean true + false → transfers present → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "mixed-bool",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: true,
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

	it("both disallow POSITIVE_INFINITY → truthy && → schema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-posinf",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: Number.POSITIVE_INFINITY,
						disallowTransferToPeers: Number.POSITIVE_INFINITY,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it("both disallow NaN → falsy && → transfers → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-nan",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: Number.NaN,
						disallowTransferToPeers: Number.NaN,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});
});
