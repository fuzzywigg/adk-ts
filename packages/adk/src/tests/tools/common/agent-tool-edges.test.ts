import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import type { LlmAgent } from "../../../agents/llm-agent";
import { AgentTool } from "../../../tools/common/agent-tool";

function makeStubAgent(
	overrides: Partial<{
		name: string;
		description: string;
		instruction: string | (() => string);
	}> = {},
): LlmAgent {
	return {
		name: overrides.name ?? "stub_agent",
		description: overrides.description ?? "agent-desc",
		instruction: overrides.instruction ?? "agent-instruction",
		runAsync: async function* () {},
	} as LlmAgent;
}

describe("AgentTool leftover edges (TOKENMAXX post #124)", () => {
	it("coerces maxRetryAttempts 0 to default 3 via falsy ||", () => {
		const tool = new AgentTool({
			name: "retry_zero",
			agent: makeStubAgent(),
			maxRetryAttempts: 0,
		});
		expect(tool.maxRetryAttempts).toBe(3);
	});

	it("prefers explicit description over agent.description", () => {
		const tool = new AgentTool({
			name: "desc_override",
			description: "tool-override",
			agent: makeStubAgent({ description: "agent-desc" }),
		});
		expect(tool.description).toBe("tool-override");
	});

	it("defaults isLongRunning and shouldRetryOnFailure to false when omitted", () => {
		const tool = new AgentTool({
			name: "bool_defaults",
			agent: makeStubAgent(),
		});
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("getDeclaration uses tool description when instruction is non-string", () => {
		const tool = new AgentTool({
			name: "fn_instr",
			description: "from-tool",
			agent: makeStubAgent({
				instruction: (() => "dynamic") as unknown as string,
			}),
		});
		const declaration = tool.getDeclaration();
		expect(declaration.description).toBe("from-tool");
		expect(declaration.parameters?.required).toEqual(["input"]);
		expect(declaration.parameters?.properties?.input?.type).toBe(Type.STRING);
	});

	it("getDeclaration short-circuits on provided functionDeclaration", () => {
		const custom = {
			name: "custom_fn",
			description: "custom",
			parameters: {
				type: Type.OBJECT,
				properties: {
					q: { type: Type.STRING, description: "query" },
				},
				required: ["q"],
			},
		};
		const tool = new AgentTool({
			name: "with_decl",
			agent: makeStubAgent(),
			functionDeclaration: custom,
		});
		expect(tool.getDeclaration()).toBe(custom);
	});
});
