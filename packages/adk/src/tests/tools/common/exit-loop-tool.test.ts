import { describe, expect, it } from "vitest";
import { ExitLoopTool } from "../../../tools/common/exit-loop-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(): ToolContext {
	return {
		actions: {},
	} as ToolContext;
}

describe("ExitLoopTool", () => {
	it("exposes exit_loop metadata", () => {
		const tool = new ExitLoopTool();
		expect(tool.name).toBe("exit_loop");
		expect(tool.description).toContain("Exits the loop");
	});

	it("sets escalate on the tool context actions", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();

		await tool.runAsync({}, context);

		expect(context.actions.escalate).toBe(true);
	});

	it("returns undefined and ignores unused args", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();
		await expect(
			tool.runAsync({ unused: true, reason: "done" }, context),
		).resolves.toBeUndefined();
		expect(context.actions.escalate).toBe(true);
	});

	it("overwrites a prior escalate false value", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();
		context.actions.escalate = false;
		await tool.runAsync({}, context);
		expect(context.actions.escalate).toBe(true);
	});

	it("does not set transferToAgent when exiting", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();
		await tool.runAsync({}, context);
		expect(context.actions.transferToAgent).toBeUndefined();
	});

	it("exposes declaration-less metadata via BaseTool name/description", () => {
		const tool = new ExitLoopTool();
		expect(tool.name).toBe("exit_loop");
		expect(tool.description).toMatch(/instructed/i);
		expect(tool.isLongRunning).toBe(false);
	});
});
