import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { TransferToAgentTool } from "../../../tools/common/transfer-to-agent-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("TransferToAgentTool", () => {
	it("exposes transfer_to_agent metadata", () => {
		const tool = new TransferToAgentTool();
		expect(tool.name).toBe("transfer_to_agent");
		expect(tool.description).toContain("Transfer the question");
		expect(tool.description).toContain("specialized capabilities");
		expect(tool.isLongRunning).toBe(false);
	});

	it("declares required agent_name parameter", () => {
		const tool = new TransferToAgentTool();
		const declaration = tool.getDeclaration();

		expect(declaration.name).toBe("transfer_to_agent");
		expect(declaration.description).toBe(tool.description);
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["agent_name"]);
		expect(declaration.parameters?.properties?.agent_name).toEqual({
			type: Type.STRING,
			description: "The name of the agent to transfer control to",
		});
	});

	it("sets transferToAgent from args", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();

		const result = await tool.runAsync(
			{ agent_name: "research_agent" },
			context,
		);

		expect(result).toBeUndefined();
		expect(context.actions.transferToAgent).toBe("research_agent");
	});

	it("overwrites a previous transfer target", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext({ transferToAgent: "old_agent" });

		await tool.runAsync({ agent_name: "new_agent" }, context);

		expect(context.actions.transferToAgent).toBe("new_agent");
	});

	it("does not clear escalate or other action flags", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext({
			escalate: true,
			skipSummarization: true,
		});

		await tool.runAsync({ agent_name: "helper" }, context);

		expect(context.actions.transferToAgent).toBe("helper");
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.skipSummarization).toBe(true);
	});

	it.each([
		"a",
		"research_agent",
		"agent-with-dashes",
		"agent_with_underscores",
		"",
	])("accepts agent_name %j verbatim", async (agentName) => {
		const tool = new TransferToAgentTool();
		const context = makeContext();

		await tool.runAsync({ agent_name: agentName }, context);

		expect(context.actions.transferToAgent).toBe(agentName);
	});

	it("accepts unicode and whitespace agent names verbatim", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();

		await tool.runAsync({ agent_name: "  助手-エージェント  " }, context);
		expect(context.actions.transferToAgent).toBe("  助手-エージェント  ");
	});

	it("does not set escalate or skipSummarization", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();

		await tool.runAsync({ agent_name: "helper" }, context);

		expect(context.actions.transferToAgent).toBe("helper");
		expect(context.actions.escalate).toBeUndefined();
		expect(context.actions.skipSummarization).toBeUndefined();
	});

	it("logs the target agent name via the tool logger", async () => {
		const tool = new TransferToAgentTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		const context = makeContext();

		await tool.runAsync({ agent_name: "logged_agent" }, context);

		expect(debug).toHaveBeenCalledWith(expect.stringContaining("logged_agent"));
		expect(context.actions.transferToAgent).toBe("logged_agent");
	});

	it("can transfer repeatedly to different agents on the same context", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();

		await tool.runAsync({ agent_name: "first" }, context);
		await tool.runAsync({ agent_name: "second" }, context);
		await tool.runAsync({ agent_name: "third" }, context);

		expect(context.actions.transferToAgent).toBe("third");
	});

	it("returns undefined and only mutates transferToAgent", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext({ escalate: false });

		const result = await tool.runAsync({ agent_name: "only" }, context);

		expect(result).toBeUndefined();
		expect(Object.keys(context.actions).sort()).toEqual([
			"escalate",
			"transferToAgent",
		]);
	});

	it("does not retry by default", () => {
		const tool = new TransferToAgentTool();
		expect(tool.shouldRetryOnFailure).toBe(false);
		expect(tool.maxRetryAttempts).toBe(3);
	});
});
