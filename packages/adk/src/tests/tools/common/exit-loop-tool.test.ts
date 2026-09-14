import { describe, expect, it, vi } from "vitest";
import { ExitLoopTool } from "../../../tools/common/exit-loop-tool";
import type { ToolContext } from "../../../tools/tool-context";

function makeContext(actions: Record<string, unknown> = {}): ToolContext {
	return { actions } as ToolContext;
}

describe("ExitLoopTool", () => {
	it("exposes exit_loop metadata", () => {
		const tool = new ExitLoopTool();
		expect(tool.name).toBe("exit_loop");
		expect(tool.description).toContain("Exits the loop");
		expect(tool.description).toContain("instructed to do so");
	});

	it("does not declare parameters (BaseTool default)", () => {
		const tool = new ExitLoopTool();
		expect(tool.getDeclaration()).toBeNull();
	});

	it("sets escalate on the tool context actions", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();

		const result = await tool.runAsync({}, context);

		expect(result).toBeUndefined();
		expect(context.actions.escalate).toBe(true);
	});

	it("preserves other action flags and only sets escalate", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({
			transferToAgent: "other",
			skipSummarization: true,
		});

		await tool.runAsync({ ignored: true }, context);

		expect(context.actions.escalate).toBe(true);
		expect(context.actions.transferToAgent).toBe("other");
		expect(context.actions.skipSummarization).toBe(true);
	});

	it("overwrites a prior escalate=false to true", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({ escalate: false });

		await tool.runAsync({}, context);

		expect(context.actions.escalate).toBe(true);
	});

	it("accepts any args bag without using it", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();

		await tool.runAsync(
			{ reason: "done", count: 3, nested: { a: 1 } },
			context,
		);

		expect(context.actions.escalate).toBe(true);
	});

	it("is not long-running and does not retry by default", () => {
		const tool = new ExitLoopTool();
		expect(tool.isLongRunning).toBe(false);
		expect(tool.shouldRetryOnFailure).toBe(false);
	});

	it("keeps escalate true when it was already true", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({ escalate: true });

		await tool.runAsync({}, context);

		expect(context.actions.escalate).toBe(true);
	});

	it("does not set skipSummarization or transferToAgent", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();

		await tool.runAsync({}, context);

		expect(context.actions.escalate).toBe(true);
		expect(context.actions.skipSummarization).toBeUndefined();
		expect(context.actions.transferToAgent).toBeUndefined();
	});

	it("can be called repeatedly and leaves escalate true", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext();

		await tool.runAsync({}, context);
		await tool.runAsync({ again: true }, context);
		await tool.runAsync({}, context);

		expect(context.actions.escalate).toBe(true);
	});

	it("logs via the tool logger when executed", async () => {
		const tool = new ExitLoopTool();
		const debug = vi
			.spyOn((tool as any).logger, "debug")
			.mockImplementation(() => {});
		const context = makeContext();

		await tool.runAsync({}, context);

		expect(debug).toHaveBeenCalled();
		expect(context.actions.escalate).toBe(true);
	});

	it("uses the exact exit_loop description from the constructor", () => {
		const tool = new ExitLoopTool();
		expect(tool.description).toBe(
			"Exits the loop. Call this function only when you are instructed to do so.",
		);
		expect(tool.name).toBe("exit_loop");
	});

	it("returns undefined even when args is empty and actions already populated", async () => {
		const tool = new ExitLoopTool();
		const context = makeContext({
			escalate: false,
			skipSummarization: false,
			transferToAgent: "keep-me",
		});

		await expect(tool.runAsync({}, context)).resolves.toBeUndefined();
		expect(context.actions).toEqual({
			escalate: true,
			skipSummarization: false,
			transferToAgent: "keep-me",
		});
	});
});
