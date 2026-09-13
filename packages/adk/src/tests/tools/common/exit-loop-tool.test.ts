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
});
