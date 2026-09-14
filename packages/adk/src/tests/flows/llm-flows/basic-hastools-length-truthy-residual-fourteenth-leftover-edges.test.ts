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
 * `hasTools` via `canonicalTools(...).length > 0` — empty array skips tools;
 * truthy non-array length/`[x]` presence skips request-level schema.
 */
describe("basic hasTools length truthy residual fourteenth leftover", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it("canonicalTools returns [] → hasTools false → schema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "no-tools",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [],
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});

	it("canonicalTools returns one tool → hasTools true → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "one-tool",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => [{ name: "t1" }],
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
		expect(debugMock).toHaveBeenCalled();
	});

	it("canonicalTools returns string-true (length 4) → hasTools true → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "string-true-tools",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => "true" as any,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
	});

	it("canonicalTools returns empty string (length 0) → hasTools false → schema applied", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "empty-string-tools",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => "" as any,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});
});
