import { describe, expect, it } from "vitest";
import { AgentTool } from "../../../tools/common/agent-tool";
import type { LlmAgent } from "../../../agents/llm-agent";

/**
 * Fourteenth leftover: getDeclaration uses `typeof instruction === "string"` —
 * empty string is kept (does not fall back to tool description).
 */
describe("agent-tool empty-string instruction keep fourteenth leftover", () => {
	it('instruction: "" is a string so declaration.description stays empty', () => {
		const agent = {
			name: "stub",
			description: "Agent description fallback",
			instruction: "",
		} as LlmAgent;
		const tool = new AgentTool({
			name: "empty_instr",
			description: "Tool description fallback text",
			agent,
		});
		expect(tool.getDeclaration().description).toBe("");
	});

	it("non-string instruction falls back to tool description (control)", () => {
		const agent = {
			name: "stub",
			description: "Agent description fallback",
			instruction: { prompt: "x" },
		} as unknown as LlmAgent;
		const tool = new AgentTool({
			name: "obj_instr",
			description: "Tool description fallback text",
			agent,
		});
		expect(tool.getDeclaration().description).toBe(
			"Tool description fallback text",
		);
	});
});
