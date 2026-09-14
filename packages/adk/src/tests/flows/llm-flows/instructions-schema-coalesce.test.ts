import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { LlmRequest } from "../../../models/llm-request";

const toJSONSchema = vi.hoisted(() => vi.fn(() => null as unknown));

vi.mock("zod", async (importOriginal) => {
	const actual = await importOriginal<typeof import("zod")>();
	const z = actual.default;
	return {
		...actual,
		default: new Proxy(z, {
			get(target, prop, receiver) {
				if (prop === "toJSONSchema") {
					return toJSONSchema;
				}
				return Reflect.get(target, prop, receiver);
			},
		}),
	};
});

vi.mock("../../../utils/instructions-utils", () => ({
	injectSessionState: vi.fn(
		async (instruction: string) => `injected:${instruction}`,
	),
}));

import { requestProcessor } from "../../../flows/llm-flows/instructions";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

describe("instructions falsy toJSONSchema coalesce", () => {
	beforeEach(() => {
		toJSONSchema.mockReset();
	});

	it.each([
		null,
		undefined,
		false,
		0,
		"",
	])("coalesces falsy toJSONSchema result (%j) via || {}", async (falsy) => {
		toJSONSchema.mockReturnValue(falsy);
		const agent = {
			name: "falsy-schema",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: { placeholder: true },
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("application/json");
		expect(text).toContain("IMPORTANT:");
		expect(toJSONSchema).toHaveBeenCalled();
	});
});
