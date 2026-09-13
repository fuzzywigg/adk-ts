import { Type } from "@google/genai";
import { describe, expect, it } from "vitest";
import { TransferToAgentTool } from "../../../tools/common/transfer-to-agent-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return {
		actions: {},
	} as ToolContext;
}

describe("TransferToAgentTool", () => {
	it("declares required agent_name parameter", () => {
		const tool = new TransferToAgentTool();
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("transfer_to_agent");
		expect(declaration.parameters?.required).toEqual(["agent_name"]);
		expect(declaration.parameters?.properties?.agent_name?.type).toBe(
			Type.STRING,
		);
	});

	it("sets transferToAgent from args", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();

		await tool.runAsync({ agent_name: "research_agent" }, context);

		expect(context.actions.transferToAgent).toBe("research_agent");
	});
});
