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

	it("overwrites a previous transferToAgent value", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();
		context.actions.transferToAgent = "old_agent";

		await tool.runAsync({ agent_name: "new_agent" }, context);

		expect(context.actions.transferToAgent).toBe("new_agent");
	});

	it("returns undefined from runAsync after setting the action", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();
		await expect(
			tool.runAsync({ agent_name: "helper" }, context),
		).resolves.toBeUndefined();
	});

	it("exposes transfer_to_agent metadata description", () => {
		const tool = new TransferToAgentTool();
		expect(tool.name).toBe("transfer_to_agent");
		expect(tool.description).toMatch(/Transfer/i);
		expect(tool.getDeclaration().description).toBe(tool.description);
	});

	it("does not set escalate when transferring", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();
		await tool.runAsync({ agent_name: "x" }, context);
		expect(context.actions.escalate).toBeUndefined();
		expect(context.actions.skipSummarization).toBeUndefined();
	});
});
