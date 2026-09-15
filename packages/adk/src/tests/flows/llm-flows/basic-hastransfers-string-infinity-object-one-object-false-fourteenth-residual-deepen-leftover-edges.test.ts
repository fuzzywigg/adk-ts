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
 * Fourteenth leftover residual deepen (complements #254 true/posinf/NaN):
 * `hasTransfers` — both string `"Infinity"` / `Object(1)` / `Object(false)`
 * are truthy `&&` so schema applies; mixed Object(false)+false still transfers.
 */
describe("basic hasTransfers string-infinity/object-one/object-false fourteenth residual deepen", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it.each([
		{ label: 'string "Infinity"', value: "Infinity" },
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
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

	it("mixed Object(false) + false → transfers present → schema skipped", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "mixed-obj-false",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						subAgents: [{ name: "peer" }],
						canonicalTools: async () => [],
						disallowTransferToParent: Object(false),
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
