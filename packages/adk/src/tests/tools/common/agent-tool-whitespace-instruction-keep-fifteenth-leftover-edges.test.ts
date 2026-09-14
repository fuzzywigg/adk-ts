import { describe, expect, it } from "vitest";
import { AgentTool } from "../../../tools/common/agent-tool";
import type { LlmAgent } from "../../../agents/llm-agent";

/**
 * Fifteenth leftover: `typeof instruction === "string"` — whitespace strings
 * are kept (no trim/fallback). Fourteenth pinned empty string only.
 */
describe("agent-tool whitespace instruction keep fifteenth leftover", () => {
	it.each([
		{ label: "single space", instruction: " " },
		{ label: "double space", instruction: "  " },
		{ label: "tab", instruction: "\t" },
	] as const)("instruction $label is kept as declaration.description", ({
		instruction,
	}) => {
		const agent = {
			name: "stub",
			description: "Agent description fallback",
			instruction,
		} as LlmAgent;
		const tool = new AgentTool({
			name: "ws_instr",
			description: "Tool description fallback text",
			agent,
		});
		expect(tool.getDeclaration().description).toBe(instruction);
	});

	it("non-string instruction falls back to tool description (control)", () => {
		const agent = {
			name: "stub",
			description: "Agent description fallback",
			instruction: 12,
		} as unknown as LlmAgent;
		const tool = new AgentTool({
			name: "num_instr",
			description: "Tool description fallback text",
			agent,
		});
		expect(tool.getDeclaration().description).toBe(
			"Tool description fallback text",
		);
	});
});
