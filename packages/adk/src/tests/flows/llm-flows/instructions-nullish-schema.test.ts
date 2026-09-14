import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvocationContext } from "../../../agents/invocation-context";
import { LlmRequest } from "../../../models/llm-request";

const toJSONSchemaMock = vi.hoisted(() => vi.fn());

vi.mock("zod", async (importOriginal) => {
	const actual = await importOriginal<typeof import("zod")>();
	const zProxy = new Proxy(actual.default as object, {
		get(target, prop, receiver) {
			if (prop === "toJSONSchema") {
				return (...args: unknown[]) => toJSONSchemaMock(...args);
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return {
		...actual,
		default: zProxy,
		z: zProxy,
	};
});

vi.mock("../../../utils/instructions-utils", () => ({
	injectSessionState: vi.fn(
		async (instruction: string) => `injected:${instruction}`,
	),
}));

const { requestProcessor } = await import(
	"../../../flows/llm-flows/instructions"
);
const zod = await import("zod");
const z = zod.default;

describe("instructions nullish toJSONSchema leftover edges (post #124)", () => {
	beforeEach(() => {
		toJSONSchemaMock.mockReset();
	});

	async function drain(
		gen: AsyncGenerator<unknown, void, unknown>,
	): Promise<void> {
		for await (const _ of gen) {
			/* no events expected */
		}
	}

	it("coalesces null toJSONSchema results to {}", async () => {
		toJSONSchemaMock.mockReturnValue(null);
		const agent = {
			name: "null-schema",
			canonicalModel: "gpt-4o",
			instruction: "keep going",
			rootAgent: { name: "root" },
			outputSchema: z.object({ x: z.number() }),
			canonicalInstruction: async () =>
				["keep going", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("keep going");
		expect(text).toContain("application/json");
		expect(text).toContain("IMPORTANT: After any tool calls");
		expect(text).toContain("{}");
		expect(toJSONSchemaMock).toHaveBeenCalled();
	});

	it("coalesces undefined toJSONSchema results to {}", async () => {
		toJSONSchemaMock.mockReturnValue(undefined);
		const agent = {
			name: "undef-schema",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: z.object({ y: z.string() }),
			canonicalInstruction: async () => ["", true] as [string, boolean],
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
		expect(text).toMatch(/\{\s*\}/);
		expect(toJSONSchemaMock).toHaveBeenCalled();
	});
});
