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
 * Fourteenth leftover: `hasTransfers` `&&` disallow residual —
 * both `"true"` → no transfers → schema applies; one `"true"`+false still
 * transfers → schema skipped; both `-0` falsy → transfers → schema skipped.
 */
describe("basic hasTransfers string-true/negzero fourteenth leftover", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it("both disallow string-true → hasTransfers false → schema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-string-true",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: "true",
						disallowTransferToPeers: "true",
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it("one disallow string-true + one false → transfers present → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "one-string-true",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: "true",
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

	it("both disallow -0 → falsy && → transfers allowed → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-negzero",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: -0,
						disallowTransferToPeers: -0,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("both disallow empty-array → truthy && → hasTransfers false → schema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-empty-array",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: [],
						disallowTransferToPeers: [],
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});
});
