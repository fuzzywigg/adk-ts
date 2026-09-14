import { Type } from "@google/genai";
import { describe, expect, it, vi } from "vitest";
import { ExitLoopTool } from "../../../tools/common/exit-loop-tool";
import { TransferToAgentTool } from "../../../tools/common/transfer-to-agent-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("TransferToAgentTool matrix leftover edges", () => {
	it("declares a single required agent_name string parameter", () => {
		const tool = new TransferToAgentTool();
		const declaration = tool.getDeclaration();
		expect(declaration.name).toBe("transfer_to_agent");
		expect(declaration.parameters?.type).toBe(Type.OBJECT);
		expect(declaration.parameters?.required).toEqual(["agent_name"]);
		expect(declaration.parameters?.properties?.agent_name?.type).toBe(
			Type.STRING,
		);
	});

	it("sets transferToAgent and returns undefined", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();
		await expect(
			tool.runAsync({ agent_name: "researcher" }, context),
		).resolves.toBeUndefined();
		expect(context.actions.transferToAgent).toBe("researcher");
	});

	it("overwrites prior transfer targets without clearing other flags", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext({
			transferToAgent: "old",
			escalate: true,
			skipSummarization: true,
		});
		await tool.runAsync({ agent_name: "new" }, context);
		expect(context.actions.transferToAgent).toBe("new");
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("accepts empty-string agent names as the transfer target", async () => {
		const tool = new TransferToAgentTool();
		const context = makeContext();
		await tool.runAsync({ agent_name: "" }, context);
		expect(context.actions.transferToAgent).toBe("");
	});

	it("logs the transfer target via debug", async () => {
		const tool = new TransferToAgentTool();
		const debug = vi.spyOn((tool as any).logger, "debug");
		await tool.runAsync({ agent_name: "ops" }, makeContext());
		expect(debug).toHaveBeenCalled();
	});
});

describe("ExitLoopTool matrix leftover edges", () => {
	it("exposes exit_loop metadata and a null declaration", () => {
		const tool = new ExitLoopTool();
		expect(tool.name).toBe("exit_loop");
		expect(tool.description.toLowerCase()).toContain("exit");
		expect(tool.getDeclaration()).toBeNull();
	});

	it("sets escalate true and returns undefined", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();
		await expect(tool.runAsync({}, context)).resolves.toBeUndefined();
		expect(context.actions.escalate).toBe(true);
	});

	it("does not clear transferToAgent when escalating", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({ transferToAgent: "other" });
		await tool.runAsync({}, context);
		expect(context.actions.escalate).toBe(true);
		expect(context.actions.transferToAgent).toBe("other");
	});

	it("ignores unexpected args while still escalating", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();
		await tool.runAsync({ reason: "done", force: true }, context);
		expect(context.actions.escalate).toBe(true);
	});

	it("logs exit via debug", async () => {
		const tool = new ExitLoopTool();
		const debug = vi.spyOn((tool as any).logger, "debug");
		await tool.runAsync({}, makeContext());
		expect(debug).toHaveBeenCalled();
	});
});
