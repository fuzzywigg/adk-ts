import { describe, expect, it } from "vitest";
import type { LlmAgent } from "../../../agents/llm-agent";
import { AgentTool } from "../../../tools/common/agent-tool";

function makeStubAgent(
	overrides: Partial<{ name: string; description: string }> = {},
): LlmAgent {
	return {
		name: overrides.name ?? "stub_agent",
		description: overrides.description ?? "Stub agent description",
		instruction: "Answer the user request",
		runAsync: async function* () {},
	} as LlmAgent;
}

/**
 * Nineteenth leftover: AgentTool uses `description || agent.description`,
 * `skipSummarization || false`, `maxRetryAttempts || 3` — string "0"/"false"
 * keep asymmetries vs falsy coalesce (fifth already pins numeric 0).
 */
describe("agent-tool description/skip/retry string-zero/false nineteenth leftover", () => {
	it('description: "false" kept via || (length ≥ 3 passes BaseTool)', () => {
		const tool = new AgentTool({
			name: "desc_false",
			agent: makeStubAgent({ description: "agent fallback desc" }),
			description: "false",
		});
		expect(tool.description).toBe("false");
	});

	it('description: "0" kept by || then fails BaseTool min-length 3', () => {
		expect(() => {
			new AgentTool({
				name: "desc_zero",
				agent: makeStubAgent({ description: "agent fallback desc" }),
				description: "0",
			});
		}).toThrow(/too short/);
	});

	it.each([
		"0",
		"false",
	] as const)("skipSummarization: %j kept via || (unlike numeric 0 → false)", (value) => {
		const tool = new AgentTool({
			name: `skip_${value}`,
			agent: makeStubAgent(),
			skipSummarization: value as any,
		});
		expect((tool as any).skipSummarization).toBe(value);
	});

	it.each([
		"0",
		"false",
	] as const)("maxRetryAttempts: %j kept via ||", (value) => {
		const tool = new AgentTool({
			name: `max_${value}`,
			agent: makeStubAgent(),
			maxRetryAttempts: value as any,
		});
		expect(tool.maxRetryAttempts).toBe(value);
	});

	it("falsy description falls through to agent.description (control)", () => {
		const tool = new AgentTool({
			name: "desc_empty",
			agent: makeStubAgent({ description: "from agent" }),
			description: "" as any,
		});
		expect(tool.description).toBe("from agent");
	});
});
