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
 * Fifteenth residual deepen (HEAVY tip-relaunch residual after tip 1f70668 (post #282/#284); supersedes closed #281/#285/#273/#262
 * `hasTools` via `.length > 0` residual beyond fourteenth `"true"`/`""` —
 * string `"0"` / `"false"` have length > 0 so schema is skipped.
 */
describe("basic hasTools string-zero/false length fifteenth residual deepen", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it.each([
		{ label: '"0"', value: "0" },
		{ label: '"false"', value: "false" },
	])("canonicalTools returns $label (length > 0) → schema skipped", async ({
		value,
		label,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: `tools-${label}`,
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => value as any,
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
