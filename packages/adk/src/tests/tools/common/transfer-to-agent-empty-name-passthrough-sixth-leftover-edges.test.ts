import { describe, expect, it } from "vitest";
import { TransferToAgentTool } from "../../../tools/common/transfer-to-agent-tool";
import type { ToolContext } from "../../../tools/tool-context";

/**
 * Sixth leftover: runAsync assigns `context.actions.transferToAgent =
 * args.agent_name` with no truthiness gate — empty string / 0 still stick.
 */
describe("transfer-to-agent empty name passthrough sixth leftover edges", () => {
	it.each([
		{ label: '""', value: "" },
		{ label: "0", value: 0 },
		{ label: "false", value: false },
		{ label: "whitespace", value: "   " },
	] as const)("assigns falsy/odd agent_name $label without coalescing", async ({
		value,
	}) => {
		const tool = new TransferToAgentTool();
		const context = { actions: {} } as ToolContext;
		await tool.runAsync({ agent_name: value as any }, context);
		expect(context.actions.transferToAgent).toBe(value);
	});

	it("overwrites a prior transferToAgent including empty string", async () => {
		const tool = new TransferToAgentTool();
		const context = {
			actions: { transferToAgent: "prior" },
		} as ToolContext;
		await tool.runAsync({ agent_name: "" }, context);
		expect(context.actions.transferToAgent).toBe("");
		await tool.runAsync({ agent_name: "next" }, context);
		expect(context.actions.transferToAgent).toBe("next");
	});
});
