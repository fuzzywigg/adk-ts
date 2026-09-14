import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InvocationContext } from "../../../agents/invocation-context";
import { LlmRequest } from "../../../models/llm-request";

vi.mock("../../../utils/instructions-utils", () => ({
	injectSessionState: vi.fn(
		async (instruction: string) => `injected:${instruction}`,
	),
}));

import { requestProcessor } from "../../../flows/llm-flows/instructions";
import { injectSessionState } from "../../../utils/instructions-utils";

async function drain(
	gen: AsyncGenerator<unknown, void, unknown>,
): Promise<void> {
	for await (const _ of gen) {
		/* no events expected */
	}
}

describe("instructions requestProcessor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("skips non-LlmAgent agents", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent: { name: "plain" } } as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});

	it("appends global and agent instructions with state injection", async () => {
		const rootAgent = {
			canonicalModel: "gpt-4o",
			globalInstruction: "Be helpful globally",
			canonicalGlobalInstruction: async () =>
				["Be helpful globally", false] as [string, boolean],
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "Focus on code",
			rootAgent,
			canonicalInstruction: async () =>
				["Focus on code", false] as [string, boolean],
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(injectSessionState).toHaveBeenCalledTimes(2);
		expect(text).toContain("injected:Be helpful globally");
		expect(text).toContain("injected:Focus on code");
	});

	it("bypasses state injection when canonical instruction requests it", async () => {
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "raw only",
			rootAgent: { name: "root" },
			canonicalInstruction: async () => ["raw only", true] as [string, boolean],
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(injectSessionState).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toContain("raw only");
	});

	it("bypasses state injection for global instructions when requested", async () => {
		const rootAgent = {
			canonicalModel: "gpt-4o",
			globalInstruction: "raw global",
			canonicalGlobalInstruction: async () =>
				["raw global", true] as [string, boolean],
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			rootAgent,
			canonicalInstruction: async () => ["", false] as [string, boolean],
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(injectSessionState).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toContain("raw global");
	});

	it("is a no-op when agent has neither instruction nor outputSchema", async () => {
		const agent = {
			name: "empty",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
		expect(injectSessionState).not.toHaveBeenCalled();
	});

	it("appends JSON schema guidance when outputSchema is set", async () => {
		const schema = z.object({ answer: z.string() });
		const agent = {
			name: "schema-agent",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: schema,
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
		expect(text).toContain("answer");
		expect(text).toContain("IMPORTANT: After any tool calls");
	});

	it("skips schema guidance when toJSONSchema throws", async () => {
		const agent = {
			name: "bad-schema-agent",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: new Proxy(
				{},
				{
					get() {
						throw new Error("unsupported schema");
					},
				},
			),
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});

	it("appends global instruction from LlmAgent rootAgent when present", async () => {
		const rootAgent = {
			name: "root",
			canonicalModel: "gpt-4o",
			globalInstruction: "Always be polite.",
			canonicalGlobalInstruction: async () =>
				["Always be polite.", true] as [string, boolean],
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			rootAgent,
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			"Always be polite.",
		);
		expect(injectSessionState).not.toHaveBeenCalled();
	});

	it("resolves async canonicalInstruction values", async () => {
		const agent = {
			name: "async-agent",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			instruction: "placeholder",
			canonicalInstruction: async () =>
				["Dynamic instruction", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toContain(
			"Dynamic instruction",
		);
	});

	it("skips agents without canonicalModel", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: { name: "plain", instruction: "x" },
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});

	it("skips global instruction when rootAgent is not an LlmAgent", async () => {
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			rootAgent: {
				name: "root",
				globalInstruction: "should-not-apply",
			},
			instruction: "local",
			canonicalInstruction: async () => ["local", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("local");
		expect(text).not.toContain("should-not-apply");
	});
});

describe("instructions requestProcessor leftover edges", () => {
	it("appends only schema guidance when instruction strings are empty", async () => {
		const schema = z.object({ value: z.number() });
		const agent = {
			name: "schema-only",
			canonicalModel: "gpt-4o",
			rootAgent: { name: "root" },
			outputSchema: schema,
			canonicalInstruction: async () => ["", false] as [string, boolean],
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
		expect(text).toContain("value");
		expect(injectSessionState).not.toHaveBeenCalled();
	});

	it("combines injected global and agent instructions in order", async () => {
		const rootAgent = {
			canonicalModel: "gpt-4o",
			globalInstruction: "global rule",
			canonicalGlobalInstruction: async () =>
				["global rule", false] as [string, boolean],
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "local rule",
			rootAgent,
			canonicalInstruction: async () =>
				["local rule", false] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		const globalIdx = text.indexOf("injected:global rule");
		const localIdx = text.indexOf("injected:local rule");
		expect(globalIdx).toBeGreaterThanOrEqual(0);
		expect(localIdx).toBeGreaterThan(globalIdx);
	});

	it("skips global instruction when canonicalGlobalInstruction returns empty", async () => {
		const rootAgent = {
			canonicalModel: "gpt-4o",
			globalInstruction: "unused",
			canonicalGlobalInstruction: async () => ["", true] as [string, boolean],
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "only-local",
			rootAgent,
			canonicalInstruction: async () =>
				["only-local", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("only-local");
		expect(text).not.toContain("unused");
	});

	it("does not inject session state when both instructions bypass injection", async () => {
		const rootAgent = {
			canonicalModel: "gpt-4o",
			globalInstruction: "raw-global",
			canonicalGlobalInstruction: async () =>
				["raw-global", true] as [string, boolean],
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "raw-local",
			rootAgent,
			canonicalInstruction: async () =>
				["raw-local", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(injectSessionState).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toContain("raw-global");
		expect(llmRequest.getSystemInstructionText()).toContain("raw-local");
	});

	it("includes IMPORTANT tool-call JSON note when schema and instruction coexist", async () => {
		const schema = z.object({ ok: z.boolean() });
		const agent = {
			name: "both",
			canonicalModel: "gpt-4o",
			instruction: "Answer briefly",
			rootAgent: { name: "root" },
			outputSchema: schema,
			canonicalInstruction: async () =>
				["Answer briefly", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("Answer briefly");
		expect(text).toContain("IMPORTANT: After any tool calls");
	});

	it("skips global instruction when rootAgent is not an LlmAgent", async () => {
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "local only",
			rootAgent: {
				name: "sequential-root",
				globalInstruction: "should-not-apply",
			},
			canonicalInstruction: async () =>
				["local only", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("local only");
		expect(text).not.toContain("should-not-apply");
	});

	it("combines instruction and output schema guidance in one pass", async () => {
		const schema = z.object({ value: z.string(), count: z.number() });
		const agent = {
			name: "combo",
			canonicalModel: "gpt-4o",
			instruction: "Be precise",
			rootAgent: { name: "root" },
			outputSchema: schema,
			canonicalInstruction: async () =>
				["Be precise", true] as [string, boolean],
		};
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("Be precise");
		expect(text).toContain("application/json");
		expect(text).toContain("value");
		expect(text).toContain("count");
		expect(text).toContain("IMPORTANT: After any tool calls");
	});

	it("returns early for agents without canonicalModel", async () => {
		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{
					agent: {
						name: "loop",
						instruction: "ignored",
						rootAgent: { name: "root" },
					},
				} as unknown as InvocationContext,
				llmRequest,
			),
		);
		expect(llmRequest.getSystemInstructionText()).toBeUndefined();
	});
});
