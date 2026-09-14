import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import { requestProcessor } from "../../../flows/llm-flows/basic";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../logger", () => ({
	Logger: vi.fn(() => ({
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
	})),
}));

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
	}
}

/**
 * Nineteenth leftover (flows residual): `if (runConfig.responseModalities)` and
 * hasTransfers disallow string-truthy AND.
 */
describe("basic responseModalities/disallow string-truthy nineteenth leftover", () => {
	it.each([
		{ label: "null", value: null },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "empty-string", value: "" },
	])("responseModalities=$label leaves liveConnectConfig unset", async ({
		value,
	}) => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "a",
						canonicalModel: "gpt-4o",
						canonicalTools: async () => [],
					},
					runConfig: { responseModalities: value },
				} as unknown as InvocationContext,
				request,
			),
		);
		expect(request.liveConnectConfig?.responseModalities).toBeUndefined();
	});

	it("empty-array responseModalities is truthy and still copied", async () => {
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "a",
						canonicalModel: "gpt-4o",
						canonicalTools: async () => [],
					},
					runConfig: { responseModalities: [] },
				} as unknown as InvocationContext,
				request,
			),
		);
		expect(request.liveConnectConfig?.responseModalities).toEqual([]);
	});

	it('both disallow "false"/"0" are truthy so hasTransfers is false → schema applied', async () => {
		const schema = z.object({ x: z.string() });
		const request = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "a",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "child" }],
						disallowTransferToParent: "false",
						disallowTransferToPeers: "0",
						canonicalTools: async () => [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				request,
			),
		);
		expect(
			request.config?.responseSchema ?? request.responseSchema,
		).toBeTruthy();
	});

	it("both disallow boolean false → transfers present → schema skipped", async () => {
		const schema = z.object({ x: z.string() });
		const request = new LlmRequest();
		const setSpy = vi.spyOn(request, "setOutputSchema");
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "a",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "child" }],
						disallowTransferToParent: false,
						disallowTransferToPeers: false,
						canonicalTools: async () => [],
					},
					runConfig: {},
				} as unknown as InvocationContext,
				request,
			),
		);
		expect(setSpy).not.toHaveBeenCalled();
	});
});
