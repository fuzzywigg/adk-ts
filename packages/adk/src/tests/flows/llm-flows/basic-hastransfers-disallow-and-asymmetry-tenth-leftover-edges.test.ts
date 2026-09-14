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
 * Tenth leftover: `hasTransfers` uses
 * `!(disallowTransferToParent && disallowTransferToPeers)`.
 * Both truthy → schema applied; any falsy (0/`""`/null/false) keeps transfers
 * so schema is skipped. Distinct from #175 agent-transfer disallow asymmetry.
 */
describe("basic hasTransfers disallow AND asymmetry tenth leftover (post #176)", () => {
	const schema = {
		type: "object",
		properties: { a: { type: "string" } },
	};

	it("both disallow flags true → hasTransfers false → outputSchema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "both-disallow",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [{ name: "child" }],
						disallowTransferToParent: true,
						disallowTransferToPeers: true,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it.each([
		{
			label: "parent 0 / peers true",
			disallowTransferToParent: 0,
			disallowTransferToPeers: true,
		},
		{
			label: "parent true / peers 0",
			disallowTransferToParent: true,
			disallowTransferToPeers: 0,
		},
		{
			label: 'parent "" / peers true',
			disallowTransferToParent: "",
			disallowTransferToPeers: true,
		},
		{
			label: "parent true / peers null",
			disallowTransferToParent: true,
			disallowTransferToPeers: null,
		},
		{
			label: "parent false / peers true",
			disallowTransferToParent: false,
			disallowTransferToPeers: true,
		},
		{
			label: "both 0",
			disallowTransferToParent: 0,
			disallowTransferToPeers: 0,
		},
	] as const)("$label → AND falsy → hasTransfers true → schema skipped", async ({
		disallowTransferToParent,
		disallowTransferToPeers,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "and-falsy",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [{ name: "child" }],
						disallowTransferToParent,
						disallowTransferToPeers,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("both disallow true but no subAgents → schema still applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "no-subs",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [],
						disallowTransferToParent: true,
						disallowTransferToPeers: true,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it("truthy non-empty string disallow flags still count as both-true", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "stringy-true",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
						subAgents: [{ name: "child" }],
						disallowTransferToParent: "yes" as any,
						disallowTransferToPeers: "yes" as any,
					},
					runConfig: {},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});
});
