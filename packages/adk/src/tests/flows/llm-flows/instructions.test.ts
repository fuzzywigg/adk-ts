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

	it("combines agent instruction with outputSchema guidance", async () => {
		const schema = z.object({ answer: z.string() });
		const agent = {
			name: "combo",
			canonicalModel: "gpt-4o",
			instruction: "Stay concise",
			rootAgent: { name: "root" },
			outputSchema: schema,
			canonicalInstruction: async () =>
				["Stay concise", false] as [string, boolean],
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(injectSessionState).toHaveBeenCalledOnce();
		expect(text).toContain("injected:Stay concise");
		expect(text).toContain("application/json");
		expect(text).toContain("IMPORTANT: After any tool calls");
		expect(text).toContain("answer");
	});

	it("skips global instruction when root lacks globalInstruction", async () => {
		const rootAgent = {
			canonicalModel: "gpt-4o",
			canonicalGlobalInstruction: vi.fn(async () => ["should not run", false]),
		};
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "only child",
			rootAgent,
			canonicalInstruction: async () =>
				["only child", false] as [string, boolean],
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(rootAgent.canonicalGlobalInstruction).not.toHaveBeenCalled();
		expect(llmRequest.getSystemInstructionText()).toContain(
			"injected:only child",
		);
		expect(llmRequest.getSystemInstructionText()).not.toContain(
			"should not run",
		);
	});

	it("skips global path when root is not LlmAgent-shaped", async () => {
		const agent = {
			name: "child",
			canonicalModel: "gpt-4o",
			instruction: "agent only",
			rootAgent: { name: "plain-root", globalInstruction: "ignored global" },
			canonicalInstruction: async () =>
				["agent only", false] as [string, boolean],
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("injected:agent only");
		expect(text).not.toContain("ignored global");
	});

	it("applies schema-only guidance when instruction is falsy", async () => {
		const schema = z.object({ value: z.number() });
		const agent = {
			name: "schema-only",
			canonicalModel: "gpt-4o",
			instruction: "",
			rootAgent: { name: "root" },
			outputSchema: schema,
			canonicalInstruction: vi.fn(async () => ["", false]),
		};

		const llmRequest = new LlmRequest();
		await drain(
			requestProcessor.runAsync(
				{ agent } as unknown as InvocationContext,
				llmRequest,
			),
		);

		expect(agent.canonicalInstruction).not.toHaveBeenCalled();
		const text = llmRequest.getSystemInstructionText() ?? "";
		expect(text).toContain("application/json");
		expect(text).toContain("value");
		expect(text).not.toContain("injected:");
	});
});
