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
 * Fourteenth leftover residual deepen (complements #254 []/"true"/""):
 * `hasTools` via `.length > 0` — string `"Infinity"` length 8 skips schema;
 * `Object(1)` / `Object(false)` lack length so schema still applies.
 */
describe("basic hasTools string-infinity/object-one/object-false fourteenth residual deepen", () => {
	beforeEach(() => {
		debugMock.mockClear();
	});

	const schema = { type: "object", properties: { a: { type: "string" } } };

	it('canonicalTools returns string "Infinity" (length 8) → hasTools true → schema skipped', async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "string-infinity-tools",
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => "Infinity" as any,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toBeUndefined();
		expect(debugMock).toHaveBeenCalled();
	});

	it.each([
		{ label: "Object(1)", value: Object(1) },
		{ label: "Object(false)", value: Object(false) },
	])("canonicalTools returns $label (no length) → hasTools false → schema applied", async ({
		value,
		label,
	}) => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: `boxed-tools-${label}`,
						canonicalModel: "gpt-4o",
						outputSchema: schema,
						canonicalTools: async () => value as any,
					},
					runConfig: {},
				} as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.config?.responseSchema).toEqual(schema);
	});
});
